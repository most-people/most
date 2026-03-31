import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { exec } from 'node:child_process'
import { MostBoxEngine } from './src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.MOSTBOX_PORT) || 1976
const HOST = '127.0.0.1'

const wsClients = new Set()
let engine = null
let serverInstance = null

// --- Config ---
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

// --- Storage path ---
function getStoragePath() {
  const config = loadConfig()
  return config.storagePath || path.join(os.homedir(), 'most-data')
}

// --- Static file serving ---
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

    let content = data
    if (ext === '.html') {
      content = data.toString()
    }

    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
    res.end(content)
  })
}

// --- Streaming multipart parser for large files ---
async function parseMultipart(req, tempDir) {
  const boundaryMatch = req.headers['content-type']?.match(/boundary=(.+)/)
  if (!boundaryMatch) throw new Error('No boundary in content-type')
  const boundary = boundaryMatch[1]

  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  const parts = []
  const boundaryBuf = Buffer.from('--' + boundary)
  let start = 0

  while (true) {
    const idx = buffer.indexOf(boundaryBuf, start)
    if (idx === -1) break

    if (start > 0) {
      const partData = buffer.slice(start, idx - 2) // -2 for \r\n before boundary
      const headerEnd = partData.indexOf('\r\n\r\n')
      if (headerEnd !== -1) {
        const headers = partData.slice(0, headerEnd).toString()
        const body = partData.slice(headerEnd + 4)
        const nameMatch = headers.match(/name="([^"]+)"/)
        const filenameMatch = headers.match(/filename="([^"]+)"/)
        parts.push({
          name: nameMatch?.[1],
          filename: filenameMatch?.[1],
          data: body,
          headers
        })
      }
    }
    start = idx + boundaryBuf.length + 2
  }

  return parts
}

// --- JSON body parser ---
async function parseJSON(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    return {}
  }
}

// --- API Routes ---
async function handleAPI(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  const pathname = url.pathname
  const method = req.method

  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
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
      json({ storagePath: config.storagePath || '' })
      return
    }

    // POST /api/config
    if (pathname === '/api/config' && method === 'POST') {
      const body = await parseJSON(req)
      const config = loadConfig()
      if (body.storagePath !== undefined) {
        config.storagePath = body.storagePath
      }
      const success = saveConfig(config)
      json({ success, storagePath: getStoragePath() })
      return
    }

    // GET /api/config/storage-path
    if (pathname === '/api/config/storage-path' && method === 'GET') {
      json({ storagePath: getStoragePath() })
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

    // POST /api/publish — multipart file upload
    if (pathname === '/api/publish' && method === 'POST') {
      const saveDir = getStoragePath()
      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })

      let aborted = false
      req.on('close', () => {
        if (req.aborted) aborted = true
      })

      const parts = await parseMultipart(req, saveDir)

      if (aborted) {
        return
      }

      const filePart = parts.find(p => p.name === 'file')
      if (!filePart || !filePart.filename) {
        json({ error: 'No file provided' }, 400)
        return
      }

      const savedPath = path.join(saveDir, filePart.filename)
      const fileDir = path.dirname(savedPath)
      if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true })
      fs.writeFileSync(savedPath, filePart.data)

      if (aborted) {
        try { fs.unlinkSync(savedPath) } catch {}
        return
      }

      const result = await engine.publishFile(savedPath, filePart.filename)

      json({ success: true, ...result })
      return
    }

    // POST /api/download — start async download from P2P
    if (pathname === '/api/download' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.link) {
        json({ error: 'link is required' }, 400)
        return
      }

      const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // Async download — do not block HTTP response
      engine.downloadFile(body.link, taskId).then(result => {
        wsBroadcast('download:success', { taskId, ...result })
      }).catch(err => {
        if (err.message === 'Download cancelled') {
          wsBroadcast('download:cancelled', { taskId })
        } else {
          wsBroadcast('download:error', { taskId, error: err.message })
        }
      })

      json({ success: true, taskId })
      return
    }

    // POST /api/download/cancel — cancel an active download
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

    // POST /api/move — rename/move a published file (changes path without re-uploading)
    if (pathname === '/api/move' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.cid || !body.newFileName) {
        json({ error: 'cid and newFileName are required' }, 400)
        return
      }
      try {
        const result = await engine.moveFile(body.cid, body.newFileName)
        json({ success: true, ...result })
      } catch (err) {
        json({ error: err.message }, 400)
      }
      return
    }

    // POST /api/folder/rename — rename a folder (renames all files within)
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

    // GET /api/files/:cid/download — serve file inline for preview / download
    if (pathname.match(/^\/api\/files\/[^/]+\/download$/) && method === 'GET') {
      const cid = pathname.split('/')[3]
      const files = engine.listPublishedFiles()
      const file = files.find(f => f.cid === cid)

      if (!file || !file.originalPath || !fs.existsSync(file.originalPath)) {
        json({ error: 'File not found' }, 404)
        return
      }

      const stat = fs.statSync(file.originalPath)
      const ext = path.extname(file.fileName).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes'
      })
      fs.createReadStream(file.originalPath).pipe(res)
      return
    }

    // POST /api/shutdown — graceful server shutdown
    if (pathname === '/api/shutdown' && method === 'POST') {
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

    // GET /api/trash — list trash files
    if (pathname === '/api/trash' && method === 'GET') {
      json(engine.listTrashFiles())
      return
    }

    // POST /api/trash/:cid/restore — restore file from trash
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

    // DELETE /api/trash/:cid — permanently delete a trash file
    if (pathname.match(/^\/api\/trash\/[^/]+$/) && method === 'DELETE') {
      const cid = pathname.split('/')[3]
      const result = await engine.permanentDeleteTrashFile(cid)
      json({ success: true, trashFiles: result })
      return
    }

    // DELETE /api/trash — empty trash
    if (pathname === '/api/trash' && method === 'DELETE') {
      const result = await engine.emptyTrash()
      json({ success: true, trashFiles: result })
      return
    }

    // POST /api/files/:cid/star — toggle starred status
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

    // GET /api/storage — get storage statistics
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

// --- Minimal WebSocket (RFC 6455) ---
function upgradeToWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key']
  if (!key) { socket.destroy(); return }

  const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  const accept = crypto.createHash('sha1')
    .update(key + MAGIC)
    .digest('base64')

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    '\r\n'
  )

  wsClients.add(socket)
  socket.on('close', () => wsClients.delete(socket))
  socket.on('error', () => wsClients.delete(socket))

  socket.on('data', (buf) => {
    if (buf.length < 2) return
    const opcode = buf[0] & 0x0f
    if (opcode === 0x8) {
      wsClients.delete(socket)
      socket.end()
    }
    if (opcode === 0x9) {
      const pong = Buffer.from(buf)
      pong[0] = (pong[0] & 0xf0) | 0xa
      socket.write(pong)
    }
  })
}

function wsBroadcast(event, data) {
  const payload = JSON.stringify({ event, data })
  const buf = Buffer.from(payload)

  let frame
  if (buf.length < 126) {
    frame = Buffer.alloc(2 + buf.length)
    frame[0] = 0x81
    frame[1] = buf.length
    buf.copy(frame, 2)
  } else if (buf.length < 65536) {
    frame = Buffer.alloc(4 + buf.length)
    frame[0] = 0x81
    frame[1] = 126
    frame.writeUInt16BE(buf.length, 2)
    buf.copy(frame, 4)
  } else {
    frame = Buffer.alloc(10 + buf.length)
    frame[0] = 0x81
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(buf.length), 2)
    buf.copy(frame, 10)
  }

  for (const client of wsClients) {
    try { client.write(frame) } catch {}
  }
}

// --- Main ---
async function main() {
  console.log('[MostBox] Starting core daemon...')

  const storagePath = getStoragePath()
  console.log(`[MostBox] Storage: ${storagePath}`)

  engine = new MostBoxEngine({ storagePath })

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
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url.startsWith('/api/')) {
      handleAPI(req, res)
    } else {
      serveStatic(req, res)
    }
  })

  serverInstance.on('upgrade', (req, socket) => {
    if (req.url.startsWith('/ws')) {
      upgradeToWebSocket(req, socket)
    } else {
      socket.destroy()
    }
  })

  serverInstance.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`
    console.log(`[MostBox] Server running at ${url}`)

    const cmd = process.platform === 'win32' ? 'start ""'
      : process.platform === 'darwin' ? 'open' : 'xdg-open'
    exec(`${cmd} "${url}"`)
  })

  process.on('SIGINT', async () => {
    console.log('\n[MostBox] Shutting down...')
    await engine.stop()
    serverInstance.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await engine.stop()
    serverInstance.close()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[MostBox] Fatal error:', err)
  process.exit(1)
})
