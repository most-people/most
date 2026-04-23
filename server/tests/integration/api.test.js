import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from '../../index.js'
import { MostBoxEngine } from '../../src/index.js'
import { parseMostLink } from '../../src/core/cid.js'

const TEST_PORT = 19771
const baseUrl = 'http://localhost:' + TEST_PORT

describe('HTTP API (integration)', { timeout: 180000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-api-test-'))
  let serverInstance
  let engine
  let originalProcessExit

  before(async () => {
    originalProcessExit = process.exit
    process.exit = () => {}

    const dataPath = path.join(tmpDir, 'api')
    fs.mkdirSync(dataPath, { recursive: true })
    engine = new MostBoxEngine({ dataPath })
    await engine.start()

    const { app } = createApp(engine, { port: TEST_PORT })

    serverInstance = serve({
      fetch: app.fetch,
      port: TEST_PORT,
      hostname: 'localhost',
    })

    let ready = false
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`${baseUrl}/api/node-id`)
        if (res.status === 200) {
          ready = true
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 100))
    }
    if (!ready) throw new Error('Server failed to start')
  })

  after(async () => {
    if (serverInstance) {
      serverInstance.close()
    }
    if (engine) {
      await engine.stop()
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.exit = originalProcessExit
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
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
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
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
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
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
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
        body: JSON.stringify({ link }),
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
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 400)
      const data = await res.json()
      assert.ok(data.error.includes('link'))
    })

    it('returns 400 for invalid CID', async () => {
      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: 'most://invalid-cid' }),
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('POST /api/download/cancel', () => {
    it('cancels a download by taskId', async () => {
      const res = await fetch(`${baseUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'fake-task-id' }),
      })

      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(data.success)
    })

    it('returns 400 for missing taskId', async () => {
      const res = await fetch(`${baseUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('DELETE /api/files/:cid', () => {
    it('moves file to trash', async () => {
      const pub = await engine.publishFile(
        Buffer.from('delete-test'),
        'delete.txt'
      )
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/files/${cid}`, {
        method: 'DELETE',
      })
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
        body: JSON.stringify({ cid, newFileName: 'new.txt' }),
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
        body: JSON.stringify({ cid: 'abc' }),
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
        body: JSON.stringify({ oldPath: 'folder', newPath: 'new-folder' }),
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.files.length, 2)
    })
  })

  describe('GET /api/files/:cid/download', () => {
    it('serves file content', async () => {
      const pub = await engine.publishFile(
        Buffer.from('download-content'),
        'serve.txt'
      )
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
        method: 'POST',
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
        method: 'POST',
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

      const res = await fetch(`${baseUrl}/api/trash/${cid}`, {
        method: 'DELETE',
      })
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
        body: JSON.stringify({ name: 'TestUser' }),
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
        body: JSON.stringify({ name: 'test-channel' }),
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
        body: JSON.stringify({ name: 'dup-channel' }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.name, 'dup-channel')
    })

    it('returns 400 for missing name', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert.strictEqual(res.status, 400)
    })

    it('returns 400 for invalid channel name', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ab' }),
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
        body: JSON.stringify({
          content: 'Hello!',
          author: '0x1234',
          authorName: 'TestUser',
        }),
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
        body: JSON.stringify({ content: '' }),
      })
      assert.strictEqual(res.status, 400)
    })
  })

  describe('GET /api/channels/:name/messages', () => {
    it('returns messages from a channel', async () => {
      await engine.createChannel('read-channel')
      await engine.sendMessage('read-channel', 'msg1', '0x1234', 'TestUser')
      await engine.sendMessage('read-channel', 'msg2', '0x1234', 'TestUser')

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
        await engine.sendMessage(
          'page-channel',
          `msg${i}`,
          '0x1234',
          'TestUser'
        )
      }

      const res = await fetch(
        `${baseUrl}/api/channels/page-channel/messages?limit=2&offset=0`
      )
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
      const res = await fetch(`${baseUrl}/api/channels/leave-channel`, {
        method: 'DELETE',
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(!data.channels.some(c => c.name === 'leave-channel'))
    })

    it('returns 400 for non-existent channel', async () => {
      const res = await fetch(`${baseUrl}/api/channels/nonexistent`, {
        method: 'DELETE',
      })
      assert.strictEqual(res.status, 400)
    })
  })

  describe('GET /api/config', () => {
    it('returns config with dataPath', async () => {
      const res = await fetch(`${baseUrl}/api/config`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok('dataPath' in data)
    })
  })

  describe('GET /api/network-status', () => {
    it('returns network status', async () => {
      const res = await fetch(`${baseUrl}/api/network-status`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok('peers' in data)
      assert.ok('status' in data)
    })
  })

  describe('GET /api/network', () => {
    it('returns network addresses', async () => {
      const res = await fetch(`${baseUrl}/api/network`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok('port' in data)
      assert.ok(Array.isArray(data.addresses))
      assert.ok(data.addresses.some(a => a.type === 'local'))
    })
  })

  describe('POST /api/shutdown', () => {
    it('allows localhost connection', async () => {
      const res = await fetch(`${baseUrl}/api/shutdown`, {
        method: 'POST',
      })
      assert.strictEqual(res.status, 200)
    })
  })
})
