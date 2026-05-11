import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MostBoxEngine } from '../../src/index.js'

describe('MostBoxEngine (integration)', { timeout: 240000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-engine-test-'))
  const uid = Math.random().toString(36).slice(2, 8)
  let engine

  before(async () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    const dataPath = path.join(tmpDir, 'data')
    fs.mkdirSync(dataPath, { recursive: true })
    engine = new MostBoxEngine({ dataPath })
    await engine.start()
  })

  after(async () => {
    if (engine) {
      await engine.stop().catch(() => {})
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('start() and stop()', () => {
    it('starts without error', () => {
      assert.ok(engine)
    })

    it('getNodeId returns a hex string', () => {
      const nodeId = engine.getNodeId()
      assert.strictEqual(typeof nodeId, 'string')
      assert.ok(nodeId.length > 0)
      assert.ok(/^[0-9a-f]+$/i.test(nodeId))
    })

    it('getNetworkStatus returns correct structure', () => {
      const status = engine.getNetworkStatus()
      assert.strictEqual(typeof status.peers, 'number')
      assert.strictEqual(typeof status.status, 'string')
      assert.ok(['connected', 'waiting'].includes(status.status))
    })
  })

  describe('publishFile()', () => {
    it('publishes a file from Buffer and returns CID', async () => {
      const content = Buffer.from('hello world')
      const result = await engine.publishFile(content, 'test.txt')

      assert.ok(result.cid)
      assert.ok(result.cid.startsWith('bafkrei'))
      assert.match(result.chunkMerkleRoot, /^[0-9a-f]{64}$/)
      assert.strictEqual(result.chunkSize, 256 * 1024)
      assert.strictEqual(result.chunkCount, 1)
      assert.strictEqual(result.fileName, 'test.txt')
      assert.strictEqual(
        result.link,
        `most://${result.cid}?filename=test.txt&r=${result.chunkMerkleRoot}`
      )
    })

    it('publishes a file from path and returns CID', async () => {
      const filePath = path.join(tmpDir, 'publish-path.txt')
      fs.writeFileSync(filePath, 'content from file')

      const result = await engine.publishFile(filePath, 'from-path.txt')

      assert.ok(result.cid)
      assert.strictEqual(result.fileName, 'from-path.txt')
    })

    it('same content produces same CID', async () => {
      const content = Buffer.from('identical content')

      const result1 = await engine.publishFile(content, 'file1.txt')
      const result2 = await engine.publishFile(content, 'file2.txt')

      assert.strictEqual(result1.cid, result2.cid)
      assert.strictEqual(result2.alreadyExists, true)
    })

    it('different content produces different CID', async () => {
      const content1 = Buffer.from('content A')
      const content2 = Buffer.from('content B')

      const result1 = await engine.publishFile(content1, 'a.txt')
      const result2 = await engine.publishFile(content2, 'b.txt')

      assert.notStrictEqual(result1.cid, result2.cid)
    })

    it('requires filename for Buffer content', async () => {
      await assert.rejects(
        engine.publishFile(Buffer.from('test')),
        /fileName is required/
      )
    })
  })

  describe('listPublishedFiles()', () => {
    it('returns empty array initially', () => {
      const files = engine.listPublishedFiles()
      assert.ok(Array.isArray(files))
    })

    it('lists published files', async () => {
      const initialCount = engine.listPublishedFiles().length
      await engine.publishFile(Buffer.from('test'), 'listed.txt')

      const files = engine.listPublishedFiles()
      assert.strictEqual(files.length, initialCount + 1)
      assert.match(files.at(-1).chunkMerkleRoot, /^[0-9a-f]{64}$/)
    })
  })

  describe('toggleStarred()', () => {
    it('toggles starred status', async () => {
      const result = await engine.publishFile(Buffer.from('test'), 'toggle.txt')
      const cid = result.cid

      const first = engine.toggleStarred(cid)
      assert.strictEqual(first.starred, true)

      const second = engine.toggleStarred(cid)
      assert.strictEqual(second.starred, false)
    })

    it('throws for non-existent CID', () => {
      assert.throws(
        () => engine.toggleStarred('bafkreidontexist'),
        /File not found/
      )
    })
  })

  describe('moveFile()', () => {
    it('renames a file', async () => {
      const result = await engine.publishFile(
        Buffer.from('test'),
        'old-name.txt'
      )
      const cid = result.cid

      const moved = engine.moveFile(cid, 'new-name.txt')
      assert.strictEqual(moved.fileName, 'new-name.txt')
    })
  })

  describe('deletePublishedFile() and trash', () => {
    it('moves file to trash', async () => {
      const result = await engine.publishFile(
        Buffer.from('test'),
        'to-delete.txt'
      )
      const cid = result.cid

      await engine.deletePublishedFile(cid)

      const trash = engine.listTrashFiles()
      assert.ok(trash.some(f => f.cid === cid))
    })

    it('restores file from trash', async () => {
      const result = await engine.publishFile(
        Buffer.from('test'),
        'to-restore.txt'
      )
      const cid = result.cid

      await engine.deletePublishedFile(cid)
      engine.restoreTrashFile(cid)

      const files = engine.listPublishedFiles()
      assert.ok(files.some(f => f.cid === cid))
    })
  })

  describe('getStorageStats()', () => {
    it('returns storage statistics', async () => {
      const stats = await engine.getStorageStats()

      assert.strictEqual(typeof stats.total, 'number')
      assert.strictEqual(typeof stats.used, 'number')
      assert.strictEqual(typeof stats.free, 'number')
      assert.strictEqual(typeof stats.fileCount, 'number')
    })
  })

  describe('downloadFile()', () => {
    it('returns alreadyExists for self-published content', async () => {
      const content = Buffer.from('self-download test')
      const publishResult = await engine.publishFile(content, 'self-dl.txt')

      const dlResult = await engine.downloadFile(publishResult.link)

      assert.strictEqual(dlResult.alreadyExists, true)
      assert.strictEqual(dlResult.fileName, 'self-dl.txt')
    })

    it('rejects content when r is tampered', async () => {
      const publishResult = await engine.publishFile(
        Buffer.from('merkle mismatch download test'),
        'tampered-merkle.txt'
      )
      await engine.deletePublishedFile(publishResult.cid)

      const tamperedLink = publishResult.link.replace(
        publishResult.chunkMerkleRoot,
        '0'.repeat(64)
      )

      await assert.rejects(
        engine.downloadFile(tamperedLink),
        /Merkle root mismatch/
      )
    })

    it('rejects invalid most:// link', async () => {
      await assert.rejects(
        engine.downloadFile('most://invalid-cid'),
        /Invalid CID format/
      )
    })

    it('rejects empty link', async () => {
      await assert.rejects(
        engine.downloadFile(''),
        /Link must be a non-empty string/
      )
    })
  })

  describe('cancelDownload()', () => {
    it('does not throw for unknown taskId', () => {
      assert.doesNotThrow(() => {
        engine.cancelDownload('non-existent-task-id')
      })
    })
  })

  describe('emptyTrash()', () => {
    it('permanently deletes all trash files', async () => {
      const result = await engine.publishFile(
        Buffer.from('trash-test'),
        'empty-trash.txt'
      )
      const cid = result.cid

      await engine.deletePublishedFile(cid)
      const trashBefore = engine.listTrashFiles()
      assert.ok(trashBefore.some(f => f.cid === cid))

      await engine.emptyTrash()

      const trashAfter = engine.listTrashFiles()
      assert.strictEqual(trashAfter.length, 0)
    })

    it('returns empty array after emptying', async () => {
      const result = await engine.emptyTrash()
      assert.deepStrictEqual(result, [])
    })
  })

  describe('readFileContent()', () => {
    it('throws for non-existent CID', async () => {
      await assert.rejects(
        engine.readFileContent('bafkreidontexist'),
        /File not found/
      )
    })
  })

  describe('readFileRaw()', () => {
    it('throws for non-existent CID', async () => {
      await assert.rejects(
        engine.readFileRaw('bafkreidontexist'),
        /File not found/
      )
    })
  })

  describe('renameFolder()', () => {
    it('returns empty files array when no matching files', () => {
      const result = engine.renameFolder('nonexistent', 'new-name')
      assert.deepStrictEqual(result.files, [])
    })
  })

  describe('permanentDeleteTrashFile()', () => {
    it('does not throw for non-existent CID', async () => {
      await assert.doesNotReject(
        engine.permanentDeleteTrashFile('bafkreidontexist')
      )
    })
  })

  describe('error handling', () => {
    it('throws EngineNotInitializedError before start', async () => {
      const newEngine = new MostBoxEngine({
        dataPath: path.join(tmpDir, 'unstarted'),
      })

      assert.throws(() => newEngine.getNodeId(), /Engine not initialized/)
    })

    it('throws when creating engine without dataPath', () => {
      assert.throws(() => new MostBoxEngine({}), /dataPath is required/)
    })
  })

  describe('createChannel()', () => {
    it('creates a channel with valid name', async () => {
      const result = await engine.createChannel(`test-${uid}`)
      assert.strictEqual(result.name, `test-${uid}`)
      assert.ok(result.key)
    })

    it('creates a channel with type', async () => {
      const result = await engine.createChannel(`group-${uid}`, 'group')
      assert.strictEqual(result.name, `group-${uid}`)
      assert.ok(result.key)
    })

    it('returns existing channel if already created', async () => {
      const first = await engine.createChannel(`dup-${uid}`)
      const second = await engine.createChannel(`dup-${uid}`)
      assert.strictEqual(first.key, second.key)
    })

    it('rejects invalid channel names', async () => {
      await assert.rejects(engine.createChannel('ab'), /至少 3 个字/)
    })

    it('rejects channel names with invalid characters', async () => {
      await assert.rejects(
        engine.createChannel('invalid name!'),
        /只能包含字母/
      )
    })

    it('rejects channel names that are too long', async () => {
      await assert.rejects(engine.createChannel('a'.repeat(21)), /最多 20 个字/)
    })
  })

  describe('listChannels()', () => {
    it('returns empty array initially', () => {
      const channels = engine.listChannels()
      assert.ok(Array.isArray(channels))
    })

    it('lists created channels', async () => {
      await engine.createChannel(`list-${uid}`)
      const channels = engine.listChannels()
      assert.ok(channels.some(c => c.name === `list-${uid}`))
      assert.strictEqual(typeof channels[0].peerCount, 'number')
    })
  })

  describe('sendMessage() and getChannelMessages()', () => {
    let msgEngine
    let msgTmpDir
    const uid = Math.random().toString(36).slice(2, 8)

    before(async () => {
      msgTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-msg-test-'))
      const dataPath = path.join(msgTmpDir, 'data')
      fs.mkdirSync(dataPath, { recursive: true })
      msgEngine = new MostBoxEngine({ dataPath })
      await msgEngine.start()
    })

    after(async () => {
      if (msgEngine) {
        await msgEngine.stop().catch(() => {})
      }
      fs.rmSync(msgTmpDir, { recursive: true, force: true })
    })

    it('sends and retrieves messages', async () => {
      const ch = `msg-${uid}`
      await msgEngine.createChannel(ch)
      const msg = await msgEngine.sendMessage(ch, 'Hello World')
      assert.strictEqual(msg.content, 'Hello World')
      assert.strictEqual(msg.type, 'message')
      assert.ok(msg.timestamp)

      const messages = await msgEngine.getChannelMessages(ch)
      assert.ok(Array.isArray(messages))
      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0].content, 'Hello World')
    })

    it('retrieves messages in order', async () => {
      const ch = `order-${uid}`
      await msgEngine.createChannel(ch)
      await msgEngine.sendMessage(ch, 'first')
      await msgEngine.sendMessage(ch, 'second')
      await msgEngine.sendMessage(ch, 'third')

      const messages = await msgEngine.getChannelMessages(ch)
      assert.strictEqual(messages.length, 3)
      assert.strictEqual(messages[0].content, 'first')
      assert.strictEqual(messages[2].content, 'third')
    })

    it('supports pagination with limit', async () => {
      const ch = `limit-${uid}`
      await msgEngine.createChannel(ch)
      for (let i = 0; i < 5; i++) {
        await msgEngine.sendMessage(ch, `msg${i}`)
      }

      const messages = await msgEngine.getChannelMessages(ch, {
        limit: 2,
      })
      assert.strictEqual(messages.length, 2)
      assert.strictEqual(messages[0].content, 'msg3')
      assert.strictEqual(messages[1].content, 'msg4')
    })

    it('supports pagination with offset', async () => {
      const ch = `offset-${uid}`
      await msgEngine.createChannel(ch)
      for (let i = 0; i < 5; i++) {
        await msgEngine.sendMessage(ch, `msg${i}`)
      }

      const messages = await msgEngine.getChannelMessages(ch, {
        limit: 2,
        offset: 2,
      })
      assert.strictEqual(messages.length, 2)
      assert.strictEqual(messages[0].content, 'msg1')
      assert.strictEqual(messages[1].content, 'msg2')
    })

    it('throws for empty message content', async () => {
      const ch = `empty-${uid}`
      await msgEngine.createChannel(ch)
      await assert.rejects(msgEngine.sendMessage(ch, ''), /消息内容不能为空/)
    })

    it('throws for non-existent channel', async () => {
      await assert.rejects(
        msgEngine.sendMessage('nonexistent', 'test'),
        /频道未初始化/
      )
    })
  })

  describe('leaveChannel()', () => {
    it('leaves a channel', async () => {
      await engine.createChannel(`leave-${uid}`)
      const result = await engine.leaveChannel(`leave-${uid}`)
      assert.ok(Array.isArray(result))
      assert.ok(!result.some(c => c.name === `leave-${uid}`))
    })

    it('throws for non-existent channel', async () => {
      await assert.rejects(engine.leaveChannel('does-not-exist'), /频道不存在/)
    })
  })

  describe('getChannelPeers()', () => {
    it('returns empty array for new channel', async () => {
      await engine.createChannel(`peers-${uid}`)
      const peers = engine.getChannelPeers(`peers-${uid}`)
      assert.ok(Array.isArray(peers))
      assert.strictEqual(peers.length, 0)
    })
  })

  describe('getDisplayName() and setDisplayName()', () => {
    it('returns null initially', () => {
      const name = engine.getDisplayName()
      assert.strictEqual(name, null)
    })

    it('sets and gets display name', () => {
      const result = engine.setDisplayName('TestUser')
      assert.strictEqual(result, true)
      assert.strictEqual(engine.getDisplayName(), 'TestUser')
    })
  })

  describe('joinChannel()', () => {
    it('joins an existing channel by coreKey', async () => {
      const created = await engine.createChannel(`join-${uid}`, 'group')
      const joined = await engine.joinChannel(`join-${uid}`, created.key)
      assert.strictEqual(joined.name, `join-${uid}`)
      assert.strictEqual(joined.key, created.key)

      const channels = engine.listChannels()
      assert.ok(channels.find(c => c.name === `join-${uid}`))
    })

    it('throws without coreKey for unknown channel', async () => {
      await assert.rejects(
        () => engine.joinChannel('nonexistent-channel'),
        /加入已有频道需要提供 coreKey/
      )
    })

    it('returns existing if already joined', async () => {
      await engine.createChannel(`existing-join-${uid}`)
      const r1 = await engine.joinChannel(`existing-join-${uid}`)
      const r2 = await engine.joinChannel(`existing-join-${uid}`)
      assert.strictEqual(r1.key, r2.key)
    })
  })
})
