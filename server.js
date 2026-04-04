import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import Busboy from 'busboy'
import { WebSocketServer } from 'ws'
import { MostBoxEngine } from './src/index.js'
import { parseMostLink } from './src/core/cid.js'
import { MAX_FILE_SIZE } from './src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.MOSTBOX_PORT || process.env.PORT) || 1976
const HOST = process.env.MOSTBOX_HOST || '127.0.0.1'

const MAX_JSON_BODY_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_UPLOAD_SIZE = MAX_FILE_SIZE
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'most-box-uploads')

const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 120

let engine = null
let serverInstance = null
let wss = null

// --- 配置 ---
const CONFIG_DIR = path.join(os.homedir(), '.most-box')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    }
  } catch (err) {
    console.error('[Config] Load error:', err.message)
  }
  return {}
}

function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('[Config] Save error:', err.message)
    return false
  }
}

// --- 存储路径 ---
function getDataPath() {
  const config = loadConfig()
  return config.dataPath || path.join(os.homedir(), 'most-data')
}

// --- 速率限制 ---
function checkRateLimit(clientIp) {
  const now = Date.now()
  if (!rateLimitMap.has(clientIp)) {
    rateLimitMap.set(clientIp, [])
  }
  const requests = rateLimitMap.get(clientIp)
  while (requests.length > 0 && requests[0] < now - RATE_LIMIT_WINDOW) {
    requests.shift()
  }
  if (requests.length === 0) {
    rateLimitMap.delete(clientIp)
  }
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }
  requests.push(now)
  return true
}

// --- 静态文件服务 ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url
  filePath = filePath.split('?')[0]

  const fullPath = path.join(__dirname, 'public', filePath)
  const ext = path.extname(fullPath)
  const publicDir = path.join(__dirname, 'public')

  if (!fullPath.startsWith(publicDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

function decodeFilenameFromHeader(headerStr) {
  if (!headerStr) return null

  const filenameStarMatch = headerStr.match(/filename\*=(?:UTF-8''|utf-8'')([^;\r\n]+)/i)
  if (filenameStarMatch) {
    return decodeURIComponent(filenameStarMatch[1])
  }

  const filenameMatch = headerStr.match(/filename="([^"]+)"/)
  if (filenameMatch) {
    const rawFilename = filenameMatch[1]
    try {
      const buf = Buffer.from(rawFilename, 'latin1')
      const decoded = buf.toString('utf8')
      if (decoded.includes('\ufffd')) {
        return rawFilename
      }
      return decoded
    } catch {
      return rawFilename
    }
  }

  const filenamePlainMatch = headerStr.match(/filename=([^;\r\n]+)/)
  if (filenamePlainMatch) {
    return filenamePlainMatch[1].trim()
  }
  return null
}

function parseMultipartBusboy(req) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(UPLOAD_TMP_DIR)) {
      fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true })
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: 1,
        fields: 0
      }
    })

    const result = { filePath: null, filename: null }
    let fileSize = 0
    let writeStream = null
    let tempPath = null

    busboy.on('file', (name, stream, info) => {
      result.filename = decodeFilenameFromHeader(`filename="${info.filename}"`)
      tempPath = path.join(UPLOAD_TMP_DIR, `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
      writeStream = fs.createWriteStream(tempPath)

      stream.on('data', (chunk) => {
        fileSize += chunk.length
        if (fileSize > MAX_UPLOAD_SIZE) {
          stream.destroy()
          writeStream.destroy()
          fs.unlink(tempPath, () => {})
          reject(new Error('File too large'))
          return
        }
      })

      stream.pipe(writeStream)

      writeStream.on('finish', () => {
        result.filePath = tempPath
      })

      writeStream.on('error', (err) => {
        if (tempPath) fs.unlink(tempPath, () => {})
        reject(err)
      })
    })

    busboy.on('error', (err) => {
      if (tempPath) fs.unlink(tempPath, () => {})
      reject(err)
    })

    busboy.on('close', () => {
      if (result.filePath && result.filename) {
        resolve(result)
      } else if (!result.filePath) {
        resolve(null)
      }
    })

    req.on('error', (err) => {
      if (tempPath) fs.unlink(tempPath, () => {})
      reject(err)
    })
    req.pipe(busboy)
  })
}

// --- JSON 请求体解析器（带大小限制） ---
async function parseJSON(req) {
  const chunks = []
  let totalSize = 0
  for await (const chunk of req) {
    totalSize += chunk.length
    if (totalSize > MAX_JSON_BODY_SIZE) {
      throw new Error('Request body too large')
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString()
  if (!text.trim()) {
    throw new Error('Empty request body')
  }
  return JSON.parse(text)
}

// --- API 路由 ---
async function handleAPI(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  const pathname = url.pathname
  const method = req.method

  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  try {
    // GET /api/node-id
    if (pathname === '/api/node-id' && method === 'GET') {
      json({ id: engine.getNodeId() })
      return
    }

    // GET /api/config
    if (pathname === '/api/config' && method === 'GET') {
      const config = loadConfig()
      json({ dataPath: config.dataPath || '' })
      return
    }

    // POST /api/config — 更新配置
    if (pathname === '/api/config' && method === 'POST') {
      const body = await parseJSON(req)
      const config = loadConfig()

      if (body.resetStorage) {
        config.dataPath = ''
      } else if (body.dataPath !== undefined) {
        let dataPath = body.dataPath.trim()
        let basePath = dataPath

        if (dataPath.match(/^[A-Za-z]:\\$/)) {
          basePath = dataPath
          dataPath = path.join(dataPath, 'most-data')
        }

        if (!fs.existsSync(basePath)) {
          json({ error: '目录不存在' }, 400)
          return
        }

        if (!fs.existsSync(dataPath)) {
          fs.mkdirSync(dataPath, { recursive: true })
        }

        config.dataPath = dataPath
      }

      const success = saveConfig(config)
      json({ success, dataPath: getDataPath() })
      return
    }

    // GET /api/config/data-path
    if (pathname === '/api/config/data-path' && method === 'GET') {
      const config = loadConfig()
      const isDefault = !config.dataPath
      const dataPath = getDataPath()
      json({ dataPath, isDefault })
      return
    }

    // GET /api/network-status
    if (pathname === '/api/network-status' && method === 'GET') {
      json(engine.getNetworkStatus())
      return
    }

    // GET /api/files
    if (pathname === '/api/files' && method === 'GET') {
      json(engine.listPublishedFiles())
      return
    }

    // POST /api/publish — multipart 文件上传
    if (pathname === '/api/publish' && method === 'POST') {
      const result = await parseMultipartBusboy(req)

      if (!result || !result.filename) {
        json({ error: 'No file provided' }, 400)
        return
      }

      try {
        const publishResult = await engine.publishFile(result.filePath, result.filename)
        json({ success: true, ...publishResult })
      } finally {
        fs.unlink(result.filePath, () => {})
      }
      return
    }

    // POST /api/download — 从 P2P 开始异步下载
    if (pathname === '/api/download' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.link) {
        json({ error: 'link is required' }, 400)
        return
      }

      const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const parsed = parseMostLink(body.link)
      if (parsed.error) {
        json({ error: parsed.error }, 400)
        return
      }

      const existingFile = engine.getPublishedFiles().find(f => f.cid === parsed.cid)
      if (existingFile) {
        console.log(`[MostBox] File already exists: ${existingFile.fileName}`)
        json({ success: true, taskId, alreadyExists: true, fileName: existingFile.fileName })
        return
      }

      engine.downloadFile(body.link, taskId).catch(err => {
        if (err.message === 'Download cancelled') {
          wsBroadcast('download:cancelled', { taskId })
        } else {
          wsBroadcast('download:error', { taskId, error: err.message })
        }
      })

      json({ success: true, taskId })
      return
    }

    // POST /api/download/cancel — 取消活动下载
    if (pathname === '/api/download/cancel' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.taskId) {
        json({ error: 'taskId is required' }, 400)
        return
      }
      engine.cancelDownload(body.taskId)
      json({ success: true })
      return
    }

    // DELETE /api/files/:cid
    if (pathname.startsWith('/api/files/') && method === 'DELETE') {
      const cid = pathname.replace('/api/files/', '').replace(/\/$/, '')
      const result = await engine.deletePublishedFile(cid)
      json(result)
      return
    }

    // POST /api/move — 重命名/移动已发布文件
    if (pathname === '/api/move' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.cid || !body.newFileName) {
        json({ error: 'cid and newFileName are required' }, 400)
        return
      }
      try {
        const result = engine.moveFile(body.cid, body.newFileName)
        json({ success: true, ...result })
      } catch (err) {
        json({ error: err.message }, 400)
      }
      return
    }

    // POST /api/folder/rename — 重命名文件夹
    if (pathname === '/api/folder/rename' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.oldPath || !body.newPath) {
        json({ error: 'oldPath and newPath are required' }, 400)
        return
      }
      try {
        const result = engine.renameFolder(body.oldPath, body.newPath)
        json({ success: true, ...result })
      } catch (err) {
        json({ error: err.message }, 400)
      }
      return
    }

    // GET /api/files/:cid/download — 内联服务文件，支持 Range
    if (pathname.match(/^\/api\/files\/[^/]+\/download$/) && method === 'GET') {
      const cid = pathname.split('/')[3]
      const rangeHeader = req.headers['range']

      try {
        if (rangeHeader) {
          const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10)
            const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined

            const offset = start
            const limit = end !== undefined ? end - start + 1 : undefined

            const result = await engine.readFileRaw(cid, { offset, limit })
            const contentType = getMimeType(result.fileName)

            res.writeHead(206, {
              'Content-Type': contentType,
              'Content-Length': result.buffer.length,
              'Content-Range': `bytes ${offset}-${offset + result.buffer.length - 1}/${result.totalSize}`,
              'Accept-Ranges': 'bytes'
            })
            res.end(result.buffer)
            return
          }
        }

        const result = await engine.readFileRaw(cid)
        const contentType = getMimeType(result.fileName)
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': result.totalSize,
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename="${encodeURIComponent(result.fileName)}"`
        })
        res.end(result.buffer)
      } catch (err) {
        if (err.message === 'File not found') {
          json({ error: err.message }, 404)
        } else {
          json({ error: err.message }, 400)
        }
      }
      return
    }

    // POST /api/shutdown — 优雅关闭服务器（仅允许 localhost 连接）
    if (pathname === '/api/shutdown' && method === 'POST') {
      const clientIp = req.socket.remoteAddress
      const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1'
      if (!isLocalhost) {
        json({ error: 'Forbidden' }, 403)
        return
      }
      json({ success: true })
      console.log('[MostBox] Shutdown requested via API...')
      setTimeout(async () => {
        await engine.stop()
        serverInstance.close()
        console.log('[MostBox] Server stopped.')
        process.exit(0)
      }, 100)
      return
    }

    // GET /api/trash — 列出回收站文件
    if (pathname === '/api/trash' && method === 'GET') {
      json(engine.listTrashFiles())
      return
    }

    // POST /api/trash/:cid/restore — 从回收站恢复文件
    if (pathname.match(/^\/api\/trash\/[^/]+\/restore$/) && method === 'POST') {
      const cid = pathname.split('/')[3]
      try {
        const result = engine.restoreTrashFile(cid)
        json({ success: true, files: result })
      } catch (err) {
        json({ error: err.message }, 400)
      }
      return
    }

    // DELETE /api/trash/:cid — 永久删除回收站文件
    if (pathname.match(/^\/api\/trash\/[^/]+$/) && method === 'DELETE') {
      const cid = pathname.split('/')[3]
      const result = await engine.permanentDeleteTrashFile(cid)
      json({ success: true, trashFiles: result })
      return
    }

    // DELETE /api/trash — 清空回收站
    if (pathname === '/api/trash' && method === 'DELETE') {
      const result = await engine.emptyTrash()
      json({ success: true, trashFiles: result })
      return
    }

    // POST /api/files/:cid/star — 切换星标状态
    if (pathname.match(/^\/api\/files\/[^/]+\/star$/) && method === 'POST') {
      const cid = pathname.split('/')[3]
      try {
        const result = engine.toggleStarred(cid)
        json({ success: true, ...result })
      } catch (err) {
        json({ error: err.message }, 400)
      }
      return
    }

    // GET /api/storage — 获取存储统计信息
    if (pathname === '/api/storage' && method === 'GET') {
      const result = await engine.getStorageStats()
      json(result)
      return
    }

    json({ error: 'Not found' }, 404)
  } catch (err) {
    console.error('[API Error]', err)
    json({ error: err.message, code: err.code }, 500)
  }
}

function wsBroadcast(event, data) {
  const payload = JSON.stringify({ event, data })
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        try { client.send(payload) } catch {}
      }
    })
  }
}

// --- 主函数 ---
async function main() {
  console.log('[MostBox] Starting core daemon...')

  if (fs.existsSync(UPLOAD_TMP_DIR)) {
    const staleFiles = fs.readdirSync(UPLOAD_TMP_DIR)
    for (const file of staleFiles) {
      try { fs.unlinkSync(path.join(UPLOAD_TMP_DIR, file)) } catch {}
    }
    console.log(`[MostBox] Cleaned ${staleFiles.length} stale upload temp files`)
  }

  const dataPath = getDataPath()
  console.log(`[MostBox] Storage: ${dataPath}`)

  engine = new MostBoxEngine({ dataPath })

  engine.on('download:progress', (data) => wsBroadcast('download:progress', data))
  engine.on('download:status', (data) => wsBroadcast('download:status', data))
  engine.on('download:success', (data) => wsBroadcast('download:success', data))
  engine.on('download:cancelled', (data) => wsBroadcast('download:cancelled', data))
  engine.on('publish:progress', (data) => wsBroadcast('publish:progress', data))
  engine.on('publish:success', (data) => wsBroadcast('publish:success', data))
  engine.on('connection', () => {
    wsBroadcast('network:status', engine.getNetworkStatus())
  })

  await engine.start()
  console.log('[MostBox] Engine ready')

  serverInstance = http.createServer((req, res) => {
    const allowedOrigin = `http://${HOST}:${PORT}`
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const clientIp = req.socket.remoteAddress || 'unknown'

    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Too many requests' }))
      return
    }

    if (req.url.startsWith('/api/')) {
      handleAPI(req, res).catch(err => {
        console.error('[Unhandled API Error]', err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })
    } else {
      serveStatic(req, res)
    }
  })

  wss = new WebSocketServer({ noServer: true })
  wss.on('connection', (ws) => {
    ws.on('error', () => {})
  })

  serverInstance.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/ws')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  serverInstance.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`
    console.log(`[MostBox] Server running at ${url}`)

    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore'
      }).unref()
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
      spawn(cmd, [url], {
        detached: true,
        stdio: 'ignore'
      }).unref()
    }
  })

  process.on('SIGINT', async () => {
    console.log('\n[MostBox] Shutting down...')
    await engine.stop()
    if (wss) wss.close()
    serverInstance.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await engine.stop()
    if (wss) wss.close()
    serverInstance.close()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[MostBox] Fatal error:', err)
  process.exit(1)
})
