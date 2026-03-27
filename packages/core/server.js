import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { exec } from 'node:child_process'
import { MostBoxEngine } from './src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.MOSTBOX_PORT) || 3939
const HOST = '127.0.0.1'

const wsClients = new Set()
let engine = null

// --- Storage path ---
function getStoragePath() {
  const base = process.env.APPDATA || process.env.HOME || process.cwd()
  return path.join(base, 'mostbox-data')
}

// --- Static file serving ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
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
      const tempDir = path.join(getStoragePath(), 'uploads')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

      const parts = await parseMultipart(req, tempDir)
      const filePart = parts.find(p => p.name === 'file')
      if (!filePart || !filePart.filename) {
        json({ error: 'No file provided' }, 400)
        return
      }

      const savedPath = path.join(tempDir, filePart.filename)
      fs.writeFileSync(savedPath, filePart.data)

      const result = await engine.publishFile(savedPath, filePart.filename)
      json({ success: true, ...result })
      return
    }

    // POST /api/download — download from P2P
    if (pathname === '/api/download' && method === 'POST') {
      const body = await parseJSON(req)
      if (!body.link) {
        json({ error: 'link is required' }, 400)
        return
      }
      const result = await engine.downloadFile(body.link)
      json({ success: true, ...result })
      return
    }

    // DELETE /api/files/:cid
    if (pathname.startsWith('/api/files/') && method === 'DELETE') {
      const cid = pathname.replace('/api/files/', '').replace(/\/$/, '')
      const result = engine.deletePublishedFile(cid)
      json(result)
      return
    }

    // GET /api/files/:cid/download — browser file download
    if (pathname.match(/^\/api\/files\/[^/]+\/download$/) && method === 'GET') {
      const cid = pathname.split('/')[3]
      const files = engine.listPublishedFiles()
      const file = files.find(f => f.cid === cid)

      if (!file || !file.originalPath || !fs.existsSync(file.originalPath)) {
        json({ error: 'File not found' }, 404)
        return
      }

      const stat = fs.statSync(file.originalPath)
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        'Content-Length': stat.size
      })
      fs.createReadStream(file.originalPath).pipe(res)
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
  engine.on('publish:progress', (data) => wsBroadcast('publish:progress', data))
  engine.on('publish:success', (data) => wsBroadcast('publish:success', data))
  engine.on('connection', () => {
    wsBroadcast('network:status', engine.getNetworkStatus())
  })

  await engine.start()
  console.log('[MostBox] Engine ready')

  const server = http.createServer((req, res) => {
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

  server.on('upgrade', (req, socket) => {
    if (req.url.startsWith('/ws')) {
      upgradeToWebSocket(req, socket)
    } else {
      socket.destroy()
    }
  })

  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`
    console.log(`[MostBox] Server running at ${url}`)

    const cmd = process.platform === 'win32' ? 'start ""'
      : process.platform === 'darwin' ? 'open' : 'xdg-open'
    exec(`${cmd} "${url}"`)
  })

  process.on('SIGINT', async () => {
    console.log('\n[MostBox] Shutting down...')
    await engine.stop()
    server.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await engine.stop()
    server.close()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[MostBox] Fatal error:', err)
  process.exit(1)
})
