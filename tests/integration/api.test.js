import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { MostBoxEngine } from '../../src/index.js'
import { parseMostLink } from '../../src/core/cid.js'

const TEST_PORT = 19771

describe('HTTP API (integration)', { timeout: 180000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-api-test-'))
  let serverInstance
  let engine
  let baseUrl = `http://127.0.0.1:${TEST_PORT}`

  before(async () => {
    const dataPath = path.join(tmpDir, 'api')
    fs.mkdirSync(dataPath, { recursive: true })
    engine = new MostBoxEngine({ dataPath })
    await engine.start()

    const wsClients = new Set()

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
      } else {
        frame = Buffer.alloc(4 + buf.length)
        frame[0] = 0x81
        frame[1] = 126
        frame.writeUInt16BE(buf.length, 2)
        buf.copy(frame, 4)
      }
      for (const client of wsClients) {
        try { client.write(frame) } catch {}
      }
    }

    engine.on('download:progress', (data) => wsBroadcast('download:progress', data))
    engine.on('download:status', (data) => wsBroadcast('download:status', data))
    engine.on('download:success', (data) => wsBroadcast('download:success', data))
    engine.on('download:cancelled', (data) => wsBroadcast('download:cancelled', data))
    engine.on('publish:progress', (data) => wsBroadcast('publish:progress', data))
    engine.on('publish:success', (data) => wsBroadcast('publish:success', data))

    const MIME_TYPES = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.json': 'application/json'
    }

    serverInstance = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const url = new URL(req.url, `http://127.0.0.1:${TEST_PORT}`)
      const pathname = url.pathname

      async function parseJSON(req) {
        const chunks = []
        for await (const chunk of req) {
          chunks.push(chunk)
        }
        return JSON.parse(Buffer.concat(chunks).toString())
      }

      async function parseMultipart(req) {
        const boundaryMatch = req.headers['content-type']?.match(/boundary=(?:"([^"]+)"|([^\s;]+))/)
        if (!boundaryMatch) throw new Error('No boundary')
        const boundary = boundaryMatch[1] || boundaryMatch[2]
        const chunks = []
        for await (const chunk of req) { chunks.push(chunk) }
        const buffer = Buffer.concat(chunks)
        const parts = []
        const boundaryBuf = Buffer.from('--' + boundary)
        let start = 0
        while (true) {
          const idx = buffer.indexOf(boundaryBuf, start)
          if (idx === -1) break
          if (start > 0) {
            let partStart = start
            if (buffer[partStart] === 0x0d) partStart += 2
            else if (buffer[partStart] === 0x0a) partStart++
            const partEnd = idx - 1
            const partData = buffer.slice(partStart, partEnd)
            const headerEnd = partData.indexOf('\r\n\r\n')
            if (headerEnd !== -1) {
              const headers = partData.slice(0, headerEnd).toString()
              const body = partData.slice(headerEnd + 4)
              const nameMatch = headers.match(/name="([^"]+)"/)
              const filenameMatch = headers.match(/filename="([^"]+)"/)
              parts.push({ name: nameMatch?.[1], filename: filenameMatch?.[1], data: body })
            }
          }
          start = idx + boundaryBuf.length
          if (start < buffer.length && buffer[start] === 0x0d) start++
          if (start < buffer.length && buffer[start] === 0x0a) start++
        }
        return parts
      }

      const json = (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      }

      try {
        if (pathname === '/api/node-id' && req.method === 'GET') {
          json({ id: engine.getNodeId() })
          return
        }

        if (pathname === '/api/files' && req.method === 'GET') {
          json(engine.listPublishedFiles())
          return
        }

        if (pathname === '/api/publish' && req.method === 'POST') {
          const parts = await parseMultipart(req)
          const filePart = parts.find(p => p.name === 'file')
          if (!filePart || !filePart.filename) {
            json({ error: 'No file provided' }, 400)
            return
          }
          const result = await engine.publishFile(filePart.data, filePart.filename)
          json({ success: true, ...result })
          return
        }

        if (pathname === '/api/download' && req.method === 'POST') {
          const body = await parseJSON(req)
          if (!body.link) {
            json({ error: 'link is required' }, 400)
            return
          }
          const parsed = parseMostLink(body.link)
          if (parsed.error) {
            json({ error: parsed.error }, 400)
            return
          }
          const taskId = `dl_${Date.now()}`
          const existingFile = engine.listPublishedFiles().find(f => f.cid === parsed.cid)
          if (existingFile) {
            json({ success: true, taskId, alreadyExists: true, fileName: existingFile.fileName })
            return
          }
          engine.downloadFile(body.link, taskId).catch(err => {
            wsBroadcast('download:error', { taskId, error: err.message })
          })
          json({ success: true, taskId })
          return
        }

        if (pathname === '/api/download/cancel' && req.method === 'POST') {
          const body = await parseJSON(req)
          if (!body.taskId) {
            json({ error: 'taskId is required' }, 400)
            return
          }
          engine.cancelDownload(body.taskId)
          json({ success: true })
          return
        }

        if (pathname.startsWith('/api/files/') && req.method === 'DELETE') {
          const cid = pathname.replace('/api/files/', '').replace(/\/$/, '')
          const result = await engine.deletePublishedFile(cid)
          json(result)
          return
        }

        if (pathname === '/api/move' && req.method === 'POST') {
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

        if (pathname === '/api/folder/rename' && req.method === 'POST') {
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

        if (pathname.match(/^\/api\/files\/[^/]+\/download$/) && req.method === 'GET') {
          const cid = pathname.split('/')[3]
          try {
            const result = await engine.readFileRaw(cid)
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': result.totalSize,
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

        if (pathname.match(/^\/api\/files\/[^/]+\/star$/) && req.method === 'POST') {
          const cid = pathname.split('/')[3]
          try {
            const result = engine.toggleStarred(cid)
            json({ success: true, ...result })
          } catch (err) {
            json({ error: err.message }, 400)
          }
          return
        }

        if (pathname === '/api/trash' && req.method === 'GET') {
          json(engine.listTrashFiles())
          return
        }

        if (pathname.match(/^\/api\/trash\/[^/]+\/restore$/) && req.method === 'POST') {
          const cid = pathname.split('/')[3]
          const result = engine.restoreTrashFile(cid)
          json({ success: true, files: result })
          return
        }

        if (pathname.match(/^\/api\/trash\/[^/]+$/) && req.method === 'DELETE') {
          const cid = pathname.split('/')[3]
          const result = await engine.permanentDeleteTrashFile(cid)
          json({ success: true, trashFiles: result })
          return
        }

        if (pathname === '/api/trash' && req.method === 'DELETE') {
          const result = await engine.emptyTrash()
          json({ success: true, trashFiles: result })
          return
        }

        if (pathname === '/api/storage' && req.method === 'GET') {
          const result = await engine.getStorageStats()
          json(result)
          return
        }

        if (pathname === '/api/display-name' && req.method === 'GET') {
          json({ displayName: engine.getDisplayName() })
          return
        }

        if (pathname === '/api/display-name' && req.method === 'POST') {
          const body = await parseJSON(req)
          const success = engine.setDisplayName(body.name)
          json({ success, displayName: engine.getDisplayName() })
          return
        }

        if (pathname === '/api/channels' && req.method === 'POST') {
          const body = await parseJSON(req)
          if (!body.name || !body.name.trim()) {
            json({ error: 'name is required' }, 400)
            return
          }
          try {
            const result = await engine.createChannel(body.name.trim(), body.type || 'personal')
            json({ success: true, ...result })
          } catch (err) {
            json({ error: err.message }, 400)
          }
          return
        }

        if (pathname === '/api/channels' && req.method === 'GET') {
          json(engine.listChannels())
          return
        }

        if (pathname.startsWith('/api/channels/') && req.method === 'DELETE') {
          const name = pathname.split('/')[3]
          try {
            const result = await engine.leaveChannel(name)
            json({ success: true, channels: result })
          } catch (err) {
            json({ error: err.message }, 400)
          }
          return
        }

        if (pathname.match(/^\/api\/channels\/[^/]+\/messages$/) && req.method === 'GET') {
          const name = pathname.split('/')[3]
          const urlObj = new URL(req.url, `http://127.0.0.1:${TEST_PORT}`)
          const limit = parseInt(urlObj.searchParams.get('limit') || '100', 10)
          const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10)
          try {
            const messages = await engine.getChannelMessages(name, { limit, offset })
            json(messages)
          } catch (err) {
            json({ error: err.message }, 400)
          }
          return
        }

        if (pathname.match(/^\/api\/channels\/[^/]+\/messages$/) && req.method === 'POST') {
          const name = pathname.split('/')[3]
          const body = await parseJSON(req)
          if (!body.content || !body.content.trim()) {
            json({ error: 'content is required' }, 400)
            return
          }
          try {
            const message = await engine.sendMessage(name, body.content, body.authorName)
            json({ success: true, message })
          } catch (err) {
            json({ error: err.message }, 400)
          }
          return
        }

        if (pathname.match(/^\/api\/channels\/[^/]+\/peers$/) && req.method === 'GET') {
          const name = pathname.split('/')[3]
          json(engine.getChannelPeers(name))
          return
        }

        if (pathname.startsWith('/api/')) {
          json({ error: 'Not found' }, 404)
          return
        }

        const filePath = req.url === '/' ? '/index.html' : req.url
        const fullPath = path.join(process.cwd(), 'public', filePath.split('?')[0])
        if (!fullPath.startsWith(path.join(process.cwd(), 'public'))) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        try {
          const data = fs.readFileSync(fullPath)
          const ext = path.extname(fullPath)
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
          res.end(data)
        } catch {
          res.writeHead(404)
          res.end('Not found')
        }
      } catch (err) {
        console.error('[API Error]', err)
        json({ error: err.message }, 500)
      }
    })

    serverInstance.on('upgrade', (req, socket) => {
      if (req.url.startsWith('/ws')) {
        upgradeToWebSocket(req, socket)
      } else {
        socket.destroy()
      }
    })

    await new Promise((resolve, reject) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', () => resolve())
      serverInstance.on('error', reject)
    })
  })

  after(async () => {
    if (serverInstance) {
      await engine.stop()
      serverInstance.close()
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    for (const file of engine.listPublishedFiles()) {
      await engine.deletePublishedFile(file.cid)
    }
    for (const file of engine.listTrashFiles()) {
      await engine.permanentDeleteTrashFile(file.cid)
    }
    for (const channel of engine.listChannels()) {
      await engine.leaveChannel(channel.name)
    }
  })

  describe('GET /api/node-id', () => {
    it('returns a node ID', async () => {
      const res = await fetch(`${baseUrl}/api/node-id`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.id)
      assert.ok(/^[0-9a-f]+$/i.test(data.id))
    })
  })

  describe('GET /api/files', () => {
    it('returns empty array initially', async () => {
      const res = await fetch(`${baseUrl}/api/files`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })
  })

  describe('POST /api/publish', () => {
    it('publishes a file via multipart form', async () => {
      const boundary = '----TestBoundary123'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.txt"',
        'Content-Type: text/plain',
        '',
        'hello world from API test',
        `--${boundary}--`
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(data.cid)
      assert.ok(data.link.startsWith('most://'))
      assert.strictEqual(data.fileName, 'test.txt')
    })

    it('returns 400 when no file provided', async () => {
      const boundary = '----TestBoundary123'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="notfile"',
        '',
        'test',
        `--${boundary}--`
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      })

      assert.strictEqual(res.status, 400)
    })

    it('handles Chinese filename in multipart form', async () => {
      const boundary = '----TestBoundary456'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="测试文件.txt"',
        'Content-Type: text/plain',
        '',
        'hello world from Chinese filename test',
        `--${boundary}--`
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.fileName, '测试文件.txt')
    })
  })

  describe('POST /api/download', () => {
    it('returns taskId for valid link', async () => {
      await engine.publishFile(Buffer.from('test'), 'dl-test.txt')
      const files = engine.listPublishedFiles()
      const link = files[0].link

      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link })
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(data.taskId)
      assert.strictEqual(data.alreadyExists, true)
    })

    it('returns 400 for missing link', async () => {
      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      assert.strictEqual(res.status, 400)
      const data = await res.json()
      assert.ok(data.error.includes('link'))
    })

    it('returns 400 for invalid CID', async () => {
      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: 'most://invalid-cid' })
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('POST /api/download/cancel', () => {
    it('cancels a download by taskId', async () => {
      const res = await fetch(`${baseUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'fake-task-id' })
      })

      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(data.success)
    })

    it('returns 400 for missing taskId', async () => {
      const res = await fetch(`${baseUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('DELETE /api/files/:cid', () => {
    it('moves file to trash', async () => {
      const pub = await engine.publishFile(Buffer.from('delete-test'), 'delete.txt')
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/files/${cid}`, { method: 'DELETE' })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.ok(!data.some(f => f.cid === cid))
    })
  })

  describe('POST /api/move', () => {
    it('renames a file', async () => {
      const pub = await engine.publishFile(Buffer.from('move-test'), 'old.txt')
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, newFileName: 'new.txt' })
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.fileName, 'new.txt')
    })

    it('returns 400 for missing params', async () => {
      const res = await fetch(`${baseUrl}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: 'abc' })
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('POST /api/folder/rename', () => {
    it('renames a folder', async () => {
      await engine.publishFile(Buffer.from('f1'), 'folder/file1.txt')
      await engine.publishFile(Buffer.from('f2'), 'folder/file2.txt')

      const res = await fetch(`${baseUrl}/api/folder/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: 'folder', newPath: 'new-folder' })
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.files.length, 2)
    })
  })

  describe('GET /api/files/:cid/download', () => {
    it('serves file content', async () => {
      const pub = await engine.publishFile(Buffer.from('download-content'), 'serve.txt')
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/files/${cid}/download`)
      assert.strictEqual(res.status, 200)
      const text = await res.text()
      assert.strictEqual(text, 'download-content')
    })

    it('returns 404 for non-existent CID', async () => {
      const res = await fetch(`${baseUrl}/api/files/bafkreidontexist/download`)
      assert.strictEqual(res.status, 404)
    })
  })

  describe('POST /api/files/:cid/star', () => {
    it('toggles starred status', async () => {
      await engine.publishFile(Buffer.from('test'), 'star-test.txt')
      const files = engine.listPublishedFiles()
      const cid = files[0].cid

      const res = await fetch(`${baseUrl}/api/files/${cid}/star`, {
        method: 'POST'
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(data.starred)
    })
  })

  describe('GET /api/trash', () => {
    it('returns trash files', async () => {
      await engine.publishFile(Buffer.from('trash-test'), 'trash.txt')
      await engine.deletePublishedFile(engine.listPublishedFiles()[0].cid)

      const res = await fetch(`${baseUrl}/api/trash`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 1)
      assert.strictEqual(data[0].fileName, 'trash.txt')
    })
  })

  describe('POST /api/trash/:cid/restore', () => {
    it('restores file from trash', async () => {
      await engine.publishFile(Buffer.from('restore-test'), 'restore.txt')
      const cid = engine.listPublishedFiles()[0].cid
      await engine.deletePublishedFile(cid)

      const res = await fetch(`${baseUrl}/api/trash/${cid}/restore`, {
        method: 'POST'
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(engine.listTrashFiles().length, 0)
    })
  })

  describe('DELETE /api/trash/:cid', () => {
    it('permanently deletes a trash file', async () => {
      await engine.publishFile(Buffer.from('perm-delete'), 'perm.txt')
      const cid = engine.listPublishedFiles()[0].cid
      await engine.deletePublishedFile(cid)

      const res = await fetch(`${baseUrl}/api/trash/${cid}`, { method: 'DELETE' })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(engine.listTrashFiles().length, 0)
    })
  })

  describe('DELETE /api/trash', () => {
    it('empties the trash', async () => {
      await engine.publishFile(Buffer.from('empty1'), 'empty1.txt')
      await engine.publishFile(Buffer.from('empty2'), 'empty2.txt')
      await engine.deletePublishedFile(engine.listPublishedFiles()[0].cid)
      await engine.deletePublishedFile(engine.listPublishedFiles()[0].cid)

      const res = await fetch(`${baseUrl}/api/trash`, { method: 'DELETE' })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(engine.listTrashFiles().length, 0)
    })
  })

  describe('GET /api/storage', () => {
    it('returns storage statistics', async () => {
      await engine.publishFile(Buffer.from('storage-test'), 'storage.txt')

      const res = await fetch(`${baseUrl}/api/storage`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(typeof data.total, 'number')
      assert.strictEqual(typeof data.used, 'number')
      assert.strictEqual(typeof data.fileCount, 'number')
      assert.strictEqual(data.fileCount, 1)
    })
  })

  describe('404 handling', () => {
    it('returns 404 for unknown API endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/unknown`)
      assert.strictEqual(res.status, 404)
    })
  })

  describe('GET /api/display-name', () => {
    it('returns null displayName initially', async () => {
      const res = await fetch(`${baseUrl}/api/display-name`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.displayName, null)
    })
  })

  describe('POST /api/display-name', () => {
    it('sets display name', async () => {
      const res = await fetch(`${baseUrl}/api/display-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TestUser' })
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.displayName, 'TestUser')
    })
  })

  describe('POST /api/channels', () => {
    it('creates a channel', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-channel' })
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.name, 'test-channel')
      assert.ok(data.key)
    })

    it('returns existing channel if already created', async () => {
      await engine.createChannel('dup-channel')
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'dup-channel' })
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.name, 'dup-channel')
    })

    it('returns 400 for missing name', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      assert.strictEqual(res.status, 400)
    })

    it('returns 400 for invalid channel name', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ab' })
      })
      assert.strictEqual(res.status, 400)
    })
  })

  describe('GET /api/channels', () => {
    it('returns empty array initially', async () => {
      const res = await fetch(`${baseUrl}/api/channels`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })

    it('returns created channels', async () => {
      await engine.createChannel('list-test')
      const res = await fetch(`${baseUrl}/api/channels`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.length >= 1)
      assert.ok(data.some(c => c.name === 'list-test'))
    })
  })

  describe('POST /api/channels/:name/messages', () => {
    it('sends a message to a channel', async () => {
      await engine.createChannel('msg-channel')
      const res = await fetch(`${baseUrl}/api/channels/msg-channel/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello!' })
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.message.content, 'Hello!')
    })

    it('returns 400 for empty content', async () => {
      await engine.createChannel('empty-msg')
      const res = await fetch(`${baseUrl}/api/channels/empty-msg/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' })
      })
      assert.strictEqual(res.status, 400)
    })
  })

  describe('GET /api/channels/:name/messages', () => {
    it('returns messages from a channel', async () => {
      await engine.createChannel('read-channel')
      await engine.sendMessage('read-channel', 'msg1')
      await engine.sendMessage('read-channel', 'msg2')

      const res = await fetch(`${baseUrl}/api/channels/read-channel/messages`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 2)
      assert.strictEqual(data[0].content, 'msg1')
      assert.strictEqual(data[1].content, 'msg2')
    })

    it('returns empty array for channel with no messages', async () => {
      await engine.createChannel('empty-channel')
      const res = await fetch(`${baseUrl}/api/channels/empty-channel/messages`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })

    it('supports pagination with limit and offset', async () => {
      await engine.createChannel('page-channel')
      for (let i = 0; i < 5; i++) {
        await engine.sendMessage('page-channel', `msg${i}`)
      }

      const res = await fetch(`${baseUrl}/api/channels/page-channel/messages?limit=2&offset=0`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.length, 2)
    })
  })

  describe('GET /api/channels/:name/peers', () => {
    it('returns empty peers list for new channel', async () => {
      await engine.createChannel('peers-channel')
      const res = await fetch(`${baseUrl}/api/channels/peers-channel/peers`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })
  })

  describe('DELETE /api/channels/:name', () => {
    it('leaves a channel', async () => {
      await engine.createChannel('leave-channel')
      const res = await fetch(`${baseUrl}/api/channels/leave-channel`, { method: 'DELETE' })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(!data.channels.some(c => c.name === 'leave-channel'))
    })

    it('returns 400 for non-existent channel', async () => {
      const res = await fetch(`${baseUrl}/api/channels/nonexistent`, { method: 'DELETE' })
      assert.strictEqual(res.status, 400)
    })
  })
})