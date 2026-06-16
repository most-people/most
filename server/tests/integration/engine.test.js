import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { CID } from 'multiformats/cid'
import { MostBoxEngine } from '../../src/index.js'
import { calculateCid } from '../../src/core/cid.js'
import {
  GAME_CHANNEL_TYPE,
  gameRoomCodeToChannelName,
} from '../../src/core/gameRoom.js'
import { GLOBAL_SHARED_SEED_STRING } from '../../src/config.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForHoldingStatus(
  engine,
  cid,
  expectedStatus = 'active',
  timeout = 5000
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const holding = engine.listHoldings().find(item => item.cid === cid)
    if (holding?.seedStatus === expectedStatus) {
      return holding
    }
    await sleep(25)
  }
  throw new Error(`Holding ${cid} did not reach ${expectedStatus}`)
}

async function waitForHoldingMetric(
  engine,
  cid,
  predicate,
  description,
  timeout = 5000
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const holding = engine.listHoldings().find(item => item.cid === cid)
    if (holding && predicate(holding)) {
      return holding
    }
    await sleep(25)
  }
  throw new Error(`Holding ${cid} did not report ${description}`)
}

async function waitForChannelMessage(
  engine,
  channelName,
  content,
  timeout = 5000
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const messages = await engine.getChannelMessages(channelName)
    const message = messages.find(item => item.content === content)
    if (message) return message
    await sleep(25)
  }
  throw new Error(`Channel ${channelName} did not receive ${content}`)
}

async function withMockedDateNow(timestamp, action) {
  const originalDateNow = Date.now
  Date.now = () => timestamp
  try {
    return await action()
  } finally {
    Date.now = originalDateNow
  }
}

function toChannelCandidate(channel) {
  return {
    channelId: channel.channelId || channel.name,
    channelKey: channel.channelKey || channel.key,
    type: channel.type,
    createdAt: channel.createdAt,
    lastMessageAt: channel.lastMessageAt,
    writerCoreKeys: channel.writerCoreKeys,
  }
}

function createUserSyncKeys(seed) {
  const derive = label =>
    crypto.createHash('sha256').update(`${seed}:${label}`).digest('hex')
  return {
    syncTopicKey: derive('topic'),
    syncCipherKey: derive('cipher'),
    syncMacKey: derive('mac'),
  }
}

async function waitForUserFile(engine, ownerAddress, cid, timeout = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const file = engine
      .listPublishedFiles({ ownerAddress })
      .find(item => item.cid === cid)
    if (file) return file
    await sleep(25)
  }
  throw new Error(`User file ${cid} did not sync`)
}

async function waitForUserChannel(
  engine,
  ownerAddress,
  channelKey,
  timeout = 5000,
  predicate = () => true
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const channel = engine
      .listChannels({ ownerAddress })
      .find(item => item.channelKey === channelKey)
    if (channel && predicate(channel)) return channel
    await sleep(25)
  }
  throw new Error(`User channel ${channelKey} did not sync`)
}

describe('MostBoxEngine (integration)', { timeout: 420000 }, () => {
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
      assert.strictEqual(result.fileName, 'test.txt')
      assert.strictEqual(result.link, `most://${result.cid}?filename=test.txt`)
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

    it('keeps one published record per CID even when folders differ', async () => {
      const content = Buffer.from(`unique cid record ${Date.now()}`)

      const result1 = await engine.publishFile(content, 'folder-a/same.txt')
      const result2 = await engine.publishFile(content, 'folder-b/same.txt')
      const records = engine
        .listPublishedFiles()
        .filter(file => file.cid === result1.cid)

      assert.strictEqual(result1.cid, result2.cid)
      assert.strictEqual(result2.alreadyExists, true)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0].fileName, 'folder-a/same.txt')
    })

    it('rejects duplicate names in the same folder for different CIDs', async () => {
      await engine.publishFile(Buffer.from('same folder one'), 'dup/name.txt')

      await assert.rejects(
        engine.publishFile(Buffer.from('same folder two'), 'dup/name.txt'),
        /已有同名文件/
      )
    })

    it('allows the same filename in different folders for different CIDs', async () => {
      const result1 = await engine.publishFile(
        Buffer.from('different folder one'),
        'folder-one/name.txt'
      )
      const result2 = await engine.publishFile(
        Buffer.from('different folder two'),
        'folder-two/name.txt'
      )

      assert.notStrictEqual(result1.cid, result2.cid)
      assert.strictEqual(result1.fileName, 'folder-one/name.txt')
      assert.strictEqual(result2.fileName, 'folder-two/name.txt')
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

    it('rejects moving a different CID onto an existing same-folder name', async () => {
      await engine.publishFile(Buffer.from('move conflict one'), 'move/a.txt')
      const second = await engine.publishFile(
        Buffer.from('move conflict two'),
        'move/b.txt'
      )

      assert.throws(
        () => engine.moveFile(second.cid, 'move/a.txt'),
        /已有同名文件/
      )
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
      assert.ok(!engine.listHoldings().some(f => f.cid === cid))
    })

    it('restores file from trash', async () => {
      const result = await engine.publishFile(
        Buffer.from('test'),
        'to-restore.txt'
      )
      const cid = result.cid

      await engine.deletePublishedFile(cid)
      await engine.restoreTrashFile(cid)

      const files = engine.listPublishedFiles()
      assert.ok(files.some(f => f.cid === cid))
      const holding = engine.listHoldings().find(f => f.cid === cid)
      assert.ok(holding)
      assert.strictEqual(holding.seedStatus, 'active')
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

    it('downloads bare most links using CID as the filename', async () => {
      const bareTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-bare-link-')
      )
      let publisher
      let downloader
      let replication

      try {
        publisher = new MostBoxEngine({
          dataPath: path.join(bareTmpDir, 'publisher'),
          downloadTimeout: 5000,
        })
        downloader = new MostBoxEngine({
          dataPath: path.join(bareTmpDir, 'downloader'),
          downloadTimeout: 5000,
        })
        await publisher.start()
        await downloader.start()

        const content = Buffer.from('bare most link download')
        const publishResult = await publisher.publishFile(content, 'source.txt')
        const download = downloader.downloadFile(`most://${publishResult.cid}`)

        await sleep(100)
        replication = publisher.replicateWith(downloader)
        const result = await download

        assert.strictEqual(result.fileName, publishResult.cid)
        assert.strictEqual(path.basename(result.savedPath), publishResult.cid)
        assert.deepStrictEqual(fs.readFileSync(result.savedPath), content)
      } finally {
        replication?.close()
        if (publisher) await publisher.stop().catch(() => {})
        if (downloader) await downloader.stop().catch(() => {})
        fs.rmSync(bareTmpDir, { recursive: true, force: true })
      }
    })

    it('uses CID content instead of the old metadata filename for existing downloads', async () => {
      const content = Buffer.from('existing CID with old chat metadata')
      const publishResult = await engine.publishFile(content, '#18.txt')
      const channelName = `cid-chat-${uid}`
      const chatFileName = `chat-file/${channelName}/#18.txt`
      const link = `most://${publishResult.cid}?filename=${encodeURIComponent(chatFileName)}`

      const result = await engine.downloadFile(link)

      assert.strictEqual(result.alreadyExists, true)
      assert.strictEqual(result.fileName, chatFileName)
      const readResult = await engine.readFileRaw(publishResult.cid, {
        public: true,
      })
      assert.strictEqual(readResult.buffer.toString('utf8'), content.toString())
    })

    it('does not treat metadata-only records as local content', async () => {
      const metadataTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-metadata-only-')
      )
      const dataPath = path.join(metadataTmpDir, 'data')
      const content = Buffer.from('metadata without local blocks')
      const { cid } = await calculateCid(content)
      const cidString = cid.toString()
      const { getCidInfo } = await import('../../src/core/cidTopic.js')
      const { driveName } = getCidInfo(cidString)
      let metadataEngine

      try {
        fs.mkdirSync(dataPath, { recursive: true })
        fs.writeFileSync(
          path.join(dataPath, 'published-files.json'),
          JSON.stringify(
            [
              {
                fileName: '#18.txt',
                cid: cidString,
                driveName,
                publishedAt: new Date().toISOString(),
                starred: false,
                ownerAddress: '',
              },
            ],
            null,
            2
          )
        )

        metadataEngine = new MostBoxEngine({
          dataPath,
          disableNetwork: true,
          downloadTimeout: 100,
        })
        await metadataEngine.start()

        const availability = await metadataEngine.getLocalCidAvailability(
          `most://${cidString}?filename=${encodeURIComponent('chat-file/no-seed/#18.txt')}`
        )
        assert.strictEqual(availability, null)
      } finally {
        if (metadataEngine) await metadataEngine.stop().catch(() => {})
        fs.rmSync(metadataTmpDir, { recursive: true, force: true })
      }
    })

    it('repairs missing holding when an existing file is downloaded again', async () => {
      const repairTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-existing-repair-')
      )
      const dataPath = path.join(repairTmpDir, 'data')
      let publishedLink
      let publishedCid
      let repairEngine
      let firstEngine

      try {
        firstEngine = new MostBoxEngine({ dataPath })
        await firstEngine.start()
        const publishResult = await firstEngine.publishFile(
          Buffer.from('existing metadata repair'),
          'repair.txt'
        )
        publishedLink = publishResult.link
        publishedCid = publishResult.cid
        await firstEngine.stop()
        firstEngine = null

        fs.rmSync(path.join(dataPath, 'node-holdings.json'), { force: true })

        repairEngine = new MostBoxEngine({ dataPath })
        await repairEngine.start()
        assert.ok(
          !repairEngine.listHoldings().some(item => item.cid === publishedCid)
        )

        const result = await repairEngine.downloadFile(publishedLink)

        assert.strictEqual(result.alreadyExists, true)
        const holding = repairEngine
          .listHoldings()
          .find(item => item.cid === publishedCid)
        assert.ok(holding)
        assert.strictEqual(holding.seedStatus, 'active')
      } finally {
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (repairEngine) await repairEngine.stop().catch(() => {})
        fs.rmSync(repairTmpDir, { recursive: true, force: true })
      }
    })

    it('rejects invalid most:// link', async () => {
      await assert.rejects(
        engine.downloadFile('most://invalid-cid'),
        /invalid_cid_format/
      )
    })

    it('rejects empty link', async () => {
      await assert.rejects(
        engine.downloadFile(''),
        /link_empty/
      )
    })

    it('rejects content when the recomputed CID does not exactly match the link CID', async () => {
      const mismatchTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-cid-mismatch-')
      )
      const attackerPath = path.join(mismatchTmpDir, 'attacker')
      const downloaderPath = path.join(mismatchTmpDir, 'downloader')
      const content = Buffer.from('same digest is not the same CID')
      const { cid: realCid } = await calculateCid(content)
      const fakeCid = CID.createV1(0x70, realCid.multihash).toString()
      const topicHex = b4a.toString(realCid.multihash.digest, 'hex')
      const driveName = `drive-${topicHex}`
      const seed = b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING)
      const store = new Corestore(attackerPath, {
        primaryKey: seed,
        unsafe: true,
      })
      let attacker
      let downloader
      let link

      try {
        await store.ready()
        const drive = new Hyperdrive(store.namespace(driveName))
        await drive.ready()
        const ws = drive.createWriteStream('/' + fakeCid)
        ws.end(content)
        await new Promise((resolve, reject) => {
          ws.on('finish', resolve)
          ws.on('error', reject)
        })
        await drive.close()
        await store.close()

        attacker = new MostBoxEngine({ dataPath: attackerPath })
        downloader = new MostBoxEngine({
          dataPath: downloaderPath,
          downloadTimeout: 5000,
        })
        await attacker.start()
        await downloader.start()
        await attacker.addHolding({
          cid: fakeCid,
          fileName: 'mismatch.txt',
          size: content.length,
        })

        link = attacker.replicateWith(downloader)
        await assert.rejects(
          downloader.downloadFile(
            `most://${fakeCid}?filename=mismatch.txt`,
            null,
            { timeout: 5000 }
          ),
          /File content CID mismatch/
        )
      } finally {
        link?.close()
        await store.close().catch(() => {})
        if (attacker) await attacker.stop().catch(() => {})
        if (downloader) await downloader.stop().catch(() => {})
        fs.rmSync(mismatchTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('node holdings and CID topic pull', () => {
    it('rejects holdings for non-v1 CID strings', async () => {
      await assert.rejects(
        engine.addHolding({
          cid: 'QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX',
          fileName: 'legacy.txt',
          size: 1,
        }),
        /CID v1 required/
      )
    })

    it('rejects manual holdings whose topic does not match the CID digest', async () => {
      const content = Buffer.from('holding topic mismatch')
      const { cid } = await calculateCid(content)

      await assert.rejects(
        engine.addHolding({
          cid: cid.toString(),
          fileName: 'bad-topic.txt',
          size: content.length,
          topic: '00'.repeat(32),
        }),
        /topic must match CID digest/
      )
    })

    it('normalizes manual holding driveName from the CID digest', async () => {
      const content = Buffer.from('holding drive name normalization')
      const { cid } = await calculateCid(content)
      const cidString = cid.toString()

      const holding = await engine.addHolding({
        cid: cidString,
        fileName: 'wrong-drive.txt',
        size: content.length,
        driveName: 'drive-not-from-cid',
      })

      assert.match(holding.driveName, /^drive-[0-9a-f]{64}$/)
      assert.notStrictEqual(holding.driveName, 'drive-not-from-cid')
      assert.strictEqual(holding.driveName, `drive-${holding.topic}`)
    })

    it('persists holdings and rejoins CID topics after restart', async () => {
      const holdingTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-holding-test-')
      )
      const dataPath = path.join(holdingTmpDir, 'data')
      let firstEngine
      let secondEngine

      try {
        firstEngine = new MostBoxEngine({ dataPath })
        await firstEngine.start()

        const publishResult = await firstEngine.publishFile(
          Buffer.from('holding restart test'),
          'holding.txt'
        )
        const holding = firstEngine
          .listHoldings()
          .find(item => item.cid === publishResult.cid)

        assert.ok(holding)
        assert.strictEqual(holding.size, 'holding restart test'.length)
        assert.match(holding.topic, /^[0-9a-f]{64}$/)
        assert.strictEqual(holding.joined, true)

        await firstEngine.stop()
        firstEngine = null

        secondEngine = new MostBoxEngine({ dataPath })
        await secondEngine.start()
        const queued = secondEngine
          .listHoldings()
          .find(item => item.cid === publishResult.cid)

        assert.ok(queued)
        assert.ok(['queued', 'joining', 'active'].includes(queued.seedStatus))

        const restored = await waitForHoldingStatus(
          secondEngine,
          publishResult.cid
        )

        assert.ok(restored)
        assert.strictEqual(restored.joined, true)
        assert.strictEqual(restored.topic, holding.topic)
      } finally {
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(holdingTmpDir, { recursive: true, force: true })
      }
    })

    it('pulls through local seed nodes after the uploader stops', async () => {
      const p2pTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-p2p-test-'))
      const engines = []
      const links = []

      try {
        const makeEngine = async name => {
          const dataPath = path.join(p2pTmpDir, name)
          const nextEngine = new MostBoxEngine({
            dataPath,
            downloadTimeout: 10000,
          })
          await nextEngine.start()
          engines.push(nextEngine)
          return nextEngine
        }

        const uploader = await makeEngine('uploader')
        const seedB = await makeEngine('seed-b')
        const seedC = await makeEngine('seed-c')
        const downloader = await makeEngine('downloader')

        const content = Buffer.alloc(1024 * 1024, 'a')
        const publishResult = await uploader.publishFile(content, 'seed.bin')
        const pullInput = {
          cid: publishResult.cid,
          fileName: publishResult.fileName,
          timeout: 10000,
        }

        const pullB = seedB.pullByCid(pullInput)
        await sleep(100)
        links.push(uploader.replicateWith(seedB))
        const resultB = await pullB
        assert.deepStrictEqual(fs.readFileSync(resultB.savedPath), content)
        const uploaderServed = await waitForHoldingMetric(
          uploader,
          publishResult.cid,
          holding => holding.peerCount > 0 && Boolean(holding.lastServedAt),
          'peer count and last served time'
        )
        assert.ok(uploaderServed.totalServedBytes > 0)

        const pullC = seedC.pullByCid(pullInput)
        await sleep(100)
        links.push(uploader.replicateWith(seedC))
        const resultC = await pullC
        assert.deepStrictEqual(fs.readFileSync(resultC.savedPath), content)

        await uploader.stop()
        const uploaderIndex = engines.indexOf(uploader)
        engines.splice(uploaderIndex, 1)

        const pullD = downloader.pullByCid(pullInput)
        await sleep(100)
        links.push(seedB.replicateWith(downloader))
        links.push(seedC.replicateWith(downloader))
        const resultD = await pullD

        assert.deepStrictEqual(fs.readFileSync(resultD.savedPath), content)
        assert.ok(seedB.listHoldings().some(h => h.cid === publishResult.cid))
        assert.ok(seedC.listHoldings().some(h => h.cid === publishResult.cid))
        assert.ok(
          downloader.listHoldings().some(h => h.cid === publishResult.cid)
        )
      } finally {
        for (const link of links) link.close()
        await Promise.allSettled(engines.map(nextEngine => nextEngine.stop()))
        fs.rmSync(p2pTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('cancelDownload()', () => {
    it('does not throw for unknown taskId', () => {
      assert.doesNotThrow(() => {
        engine.cancelDownload('non-existent-task-id')
      })
    })

    it('rejects an active peer wait when cancelled', async () => {
      const filePath = path.join(tmpDir, 'cancel-source.txt')
      fs.writeFileSync(filePath, 'cancel me while peers are missing')

      const { cid } = await calculateCid(filePath)
      const taskId = `cancel-${Date.now()}`
      const link = `most://${cid}?filename=cancel-source.txt`

      const download = engine.downloadFile(link, taskId, { timeout: 10000 })
      await sleep(100)
      engine.cancelDownload(taskId)

      await assert.rejects(download, /Download cancelled/)
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

    it('reads published file content', async () => {
      const content = Buffer.from('readFileRaw test content')
      const result = await engine.publishFile(content, 'read-raw.txt')

      const readResult = await engine.readFileRaw(result.cid)

      assert.ok(readResult.buffer)
      assert.strictEqual(
        readResult.buffer.toString(),
        'readFileRaw test content'
      )
      assert.strictEqual(readResult.fileName, 'read-raw.txt')
      assert.strictEqual(readResult.totalSize, content.length)
    })

    it('reads file with public option bypassing owner check', async () => {
      const content = Buffer.from('public read test')
      const ownerAddr = '0x1234567890123456789012345678901234567890'
      const result = await engine.publishFile(content, 'public-read.txt', {
        ownerAddress: ownerAddr,
      })

      const readResult = await engine.readFileRaw(result.cid, { public: true })

      assert.strictEqual(readResult.buffer.toString(), 'public read test')
    })

    it('denies access to non-owner without public option', async () => {
      const content = Buffer.from('owner restricted content')
      const ownerAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const otherAddr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const result = await engine.publishFile(content, 'owner-only.txt', {
        ownerAddress: ownerAddr,
      })

      await assert.rejects(
        engine.readFileRaw(result.cid, { ownerAddress: otherAddr }),
        /File not found/
      )
    })

    it('allows owner to read their own file', async () => {
      const content = Buffer.from('owner reads own file')
      const ownerAddr = '0xcccccccccccccccccccccccccccccccccccccccc'
      const result = await engine.publishFile(content, 'owner-read.txt', {
        ownerAddress: ownerAddr,
      })

      const readResult = await engine.readFileRaw(result.cid, {
        ownerAddress: ownerAddr,
      })

      assert.strictEqual(readResult.buffer.toString(), 'owner reads own file')
    })
  })

  describe('readFileContent()', () => {
    it('denies access to non-owner without public option', async () => {
      const content = Buffer.from('restricted content')
      const ownerAddr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      const otherAddr = '0xffffffffffffffffffffffffffffffffffffffff'
      const result = await engine.publishFile(content, 'restricted.txt', {
        ownerAddress: ownerAddr,
      })

      await assert.rejects(
        engine.readFileContent(result.cid, { ownerAddress: otherAddr }),
        /File not found/
      )
    })
  })

  describe('storage capacity', () => {
    it('rejects publish when capacity exceeded', async () => {
      const capacityTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-capacity-test-')
      )
      const dataPath = path.join(capacityTmpDir, 'data')
      let capacityEngine

      try {
        capacityEngine = new MostBoxEngine({
          dataPath,
          capacityBytes: 100,
        })
        await capacityEngine.start()

        const largeContent = Buffer.alloc(200, 'x')
        await assert.rejects(
          capacityEngine.publishFile(largeContent, 'too-large.txt'),
          /Storage capacity exceeded/
        )
      } finally {
        if (capacityEngine) await capacityEngine.stop().catch(() => {})
        fs.rmSync(capacityTmpDir, { recursive: true, force: true })
      }
    })

    it('allows publish when within capacity', async () => {
      const capacityTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-capacity-ok-')
      )
      const dataPath = path.join(capacityTmpDir, 'data')
      let capacityEngine

      try {
        capacityEngine = new MostBoxEngine({
          dataPath,
          capacityBytes: 10000,
        })
        await capacityEngine.start()

        const smallContent = Buffer.from('small file')
        const result = await capacityEngine.publishFile(
          smallContent,
          'small.txt'
        )

        assert.ok(result.cid)
      } finally {
        if (capacityEngine) await capacityEngine.stop().catch(() => {})
        fs.rmSync(capacityTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('owner isolation', () => {
    const ownerA = '0x1111111111111111111111111111111111111111'
    const ownerB = '0x2222222222222222222222222222222222222222'
    let isoEngine
    let isoTmpDir

    before(async () => {
      isoTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-owner-iso-'))
      const dataPath = path.join(isoTmpDir, 'data')
      isoEngine = new MostBoxEngine({ dataPath })
      await isoEngine.start()
    })

    after(async () => {
      if (isoEngine) await isoEngine.stop().catch(() => {})
      fs.rmSync(isoTmpDir, { recursive: true, force: true })
    })

    it('listPublishedFiles filters by owner', async () => {
      await isoEngine.publishFile(Buffer.from('owner A file'), 'a-file.txt', {
        ownerAddress: ownerA,
      })
      await isoEngine.publishFile(Buffer.from('owner B file'), 'b-file.txt', {
        ownerAddress: ownerB,
      })

      const filesA = isoEngine.listPublishedFiles({ ownerAddress: ownerA })
      const filesB = isoEngine.listPublishedFiles({ ownerAddress: ownerB })

      assert.ok(filesA.some(f => f.fileName === 'a-file.txt'))
      assert.ok(!filesA.some(f => f.fileName === 'b-file.txt'))
      assert.ok(filesB.some(f => f.fileName === 'b-file.txt'))
      assert.ok(!filesB.some(f => f.fileName === 'a-file.txt'))
    })

    it('deletePublishedFile only affects owner files', async () => {
      const result = await isoEngine.publishFile(
        Buffer.from('delete isolation'),
        'del-iso.txt',
        { ownerAddress: ownerA }
      )

      await isoEngine.deletePublishedFile(result.cid, {
        ownerAddress: ownerB,
      })

      const filesA = isoEngine.listPublishedFiles({ ownerAddress: ownerA })
      assert.ok(filesA.some(f => f.cid === result.cid))

      const trashB = isoEngine.listTrashFiles({ ownerAddress: ownerB })
      assert.ok(!trashB.some(f => f.cid === result.cid))
    })

    it('restoreTrashFile only affects owner files', async () => {
      const result = await isoEngine.publishFile(
        Buffer.from('restore isolation'),
        'restore-iso.txt',
        { ownerAddress: ownerA }
      )
      await isoEngine.deletePublishedFile(result.cid, {
        ownerAddress: ownerA,
      })

      await assert.rejects(
        isoEngine.restoreTrashFile(result.cid, { ownerAddress: ownerB }),
        /File not found in trash/
      )

      const trashA = isoEngine.listTrashFiles({ ownerAddress: ownerA })
      assert.ok(trashA.some(f => f.cid === result.cid))
    })

    it('emptyTrash only affects owner files', async () => {
      await isoEngine.publishFile(Buffer.from('trash A'), 'trash-a.txt', {
        ownerAddress: ownerA,
      })
      const resultB = await isoEngine.publishFile(
        Buffer.from('trash B'),
        'trash-b.txt',
        { ownerAddress: ownerB }
      )

      const trashA = isoEngine.listTrashFiles({ ownerAddress: ownerA })
      for (const f of trashA) {
        await isoEngine.deletePublishedFile(f.cid, { ownerAddress: ownerA })
      }

      await isoEngine.emptyTrash({ ownerAddress: ownerA })

      const trashAfterA = isoEngine.listTrashFiles({ ownerAddress: ownerA })
      assert.strictEqual(trashAfterA.length, 0)

      await isoEngine.deletePublishedFile(resultB.cid, {
        ownerAddress: ownerB,
      })
      const trashAfterB = isoEngine.listTrashFiles({ ownerAddress: ownerB })
      assert.ok(trashAfterB.some(f => f.cid === resultB.cid))
    })

    it('syncs user metadata without pulling file content automatically', async () => {
      const syncTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-user-sync-'))
      const sourcePath = path.join(syncTmpDir, 'source')
      const targetPath = path.join(syncTmpDir, 'target')
      const syncOwner = '0x3333333333333333333333333333333333333333'
      const keys = createUserSyncKeys(`files-${uid}`)
      let sourceEngine
      let targetEngine
      let replication

      try {
        sourceEngine = new MostBoxEngine({
          dataPath: sourcePath,
          disableNetwork: true,
        })
        targetEngine = new MostBoxEngine({
          dataPath: targetPath,
          disableNetwork: true,
        })
        await sourceEngine.start()
        await targetEngine.start()
        await sourceEngine.startUserSync(syncOwner, keys)
        await targetEngine.startUserSync(syncOwner, keys)

        const published = await sourceEngine.publishFile(
          Buffer.from('synced directory only'),
          'synced-dir.txt',
          { ownerAddress: syncOwner }
        )
        replication = sourceEngine.replicateWith(targetEngine)

        const synced = await waitForUserFile(
          targetEngine,
          syncOwner,
          published.cid
        )
        assert.strictEqual(synced.fileName, 'synced-dir.txt')
        assert.strictEqual(synced.localAvailable, false)
        assert.ok(
          !targetEngine.listHoldings().some(item => item.cid === published.cid)
        )

        await targetEngine.cacheFile(published.cid, {
          ownerAddress: syncOwner,
          timeout: 5000,
        })
        assert.ok(
          targetEngine.listHoldings().some(item => item.cid === published.cid)
        )
      } finally {
        replication?.close()
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (targetEngine) await targetEngine.stop().catch(() => {})
        fs.rmSync(syncTmpDir, { recursive: true, force: true })
      }
    })

    it('syncs channel metadata and opens the synced channel runtime', async () => {
      const syncTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-user-sync-channel-')
      )
      const sourcePath = path.join(syncTmpDir, 'source')
      const targetPath = path.join(syncTmpDir, 'target')
      const syncOwner = '0x4444444444444444444444444444444444444444'
      const keys = createUserSyncKeys(`channels-${uid}`)
      const channelName = `sync-${uid}`
      let sourceEngine
      let targetEngine
      let replication

      try {
        sourceEngine = new MostBoxEngine({
          dataPath: sourcePath,
          disableNetwork: true,
        })
        targetEngine = new MostBoxEngine({
          dataPath: targetPath,
          disableNetwork: true,
        })
        await sourceEngine.start()
        await targetEngine.start()
        await sourceEngine.startUserSync(syncOwner, keys)
        await targetEngine.startUserSync(syncOwner, keys)

        const created = await sourceEngine.createChannel(channelName, 'personal', {
          ownerAddress: syncOwner,
          displayName: 'Sync Owner',
        })
        sourceEngine.setChannelRemark(created.channelKey, '同步频道', {
          ownerAddress: syncOwner,
        })
        replication = sourceEngine.replicateWith(targetEngine)

        const syncedChannel = await waitForUserChannel(
          targetEngine,
          syncOwner,
          created.channelKey,
          5000,
          channel => channel.remark === '同步频道'
        )
        assert.strictEqual(syncedChannel.remark, '同步频道')
        await targetEngine.sendMessage(
          syncedChannel.channelKey,
          'from synced channel',
          syncOwner,
          'Sync Owner',
          { ownerAddress: syncOwner }
        )
        const messages = await targetEngine.getChannelMessages(
          syncedChannel.channelKey,
          { ownerAddress: syncOwner }
        )
        assert.ok(
          messages.some(message => message.content === 'from synced channel')
        )
      } finally {
        replication?.close()
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (targetEngine) await targetEngine.stop().catch(() => {})
        fs.rmSync(syncTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('listPublishedFiles() starred filter', () => {
    it('filters by starred status', async () => {
      const starTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-star-'))
      const dataPath = path.join(starTmpDir, 'data')
      let starEngine

      try {
        starEngine = new MostBoxEngine({ dataPath })
        await starEngine.start()

        const r1 = await starEngine.publishFile(Buffer.from('star1'), 's1.txt')
        const r2 = await starEngine.publishFile(Buffer.from('star2'), 's2.txt')
        await starEngine.publishFile(Buffer.from('nostar'), 'ns.txt')

        starEngine.toggleStarred(r1.cid)
        starEngine.toggleStarred(r2.cid)

        const starred = starEngine.listPublishedFiles({ starred: true })
        const all = starEngine.listPublishedFiles()

        assert.strictEqual(starred.length, 2)
        assert.ok(starred.every(f => f.starred === true))
        assert.strictEqual(all.length, 3)
      } finally {
        if (starEngine) await starEngine.stop().catch(() => {})
        fs.rmSync(starTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('addHolding() happy path', () => {
    it('adds a holding and joins CID topic', async () => {
      const holdingTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-add-holding-')
      )
      const dataPath = path.join(holdingTmpDir, 'data')
      let holdingEngine

      try {
        holdingEngine = new MostBoxEngine({ dataPath })
        await holdingEngine.start()

        const content = Buffer.from('addHolding test content')
        const { cid } = await calculateCid(content)

        await holdingEngine.addHolding({
          cid: cid.toString(),
          fileName: 'manual-holding.txt',
          size: content.length,
        })

        const holdings = holdingEngine.listHoldings()
        const holding = holdings.find(h => h.cid === cid.toString())

        assert.ok(holding)
        assert.strictEqual(holding.fileName, 'manual-holding.txt')
        assert.strictEqual(holding.size, content.length)
        assert.strictEqual(holding.source, 'manual')
        assert.match(holding.topic, /^[0-9a-f]{64}$/)
      } finally {
        if (holdingEngine) await holdingEngine.stop().catch(() => {})
        fs.rmSync(holdingTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('renameFolder()', () => {
    it('returns empty files array when no matching files', () => {
      const result = engine.renameFolder('nonexistent', 'new-name')
      assert.deepStrictEqual(result.files, [])
    })

    it('rejects folder rename when it would create a same-folder duplicate', async () => {
      await engine.publishFile(
        Buffer.from('folder rename conflict one'),
        'rename-src/a.txt'
      )
      await engine.publishFile(
        Buffer.from('folder rename conflict two'),
        'rename-target/a.txt'
      )

      assert.throws(
        () => engine.renameFolder('rename-src', 'rename-target'),
        /已有同名文件/
      )
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
      assert.strictEqual(result.channelKey, result.name)
      assert.ok(!result.channelKey.includes(':'))
    })

    it('creates a channel with type', async () => {
      const result = await engine.createChannel(`group-${uid}`, 'group')
      assert.strictEqual(result.name, `group-${uid}`)
      assert.ok(result.key)
    })

    it('creates game room channels with shared game type', async () => {
      const name = gameRoomCodeToChannelName('gandengyan', 'ABC123')
      const result = await engine.createChannel(name, GAME_CHANNEL_TYPE)
      assert.strictEqual(result.name, name)
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
      await assert.rejects(engine.createChannel('a'.repeat(31)), /最多 30 个字/)
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

  describe('getChannelMembers()', () => {
    it('stores channel members as profile objects', async () => {
      const ownerAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const channelName = `members-${uid}`
      await engine.createChannel(channelName, 'public', {
        ownerAddress,
        displayName: 'Alice#5678',
        avatar: 'data:image/png;base64,alice',
      })

      const members = engine.getChannelMembers(channelName, { ownerAddress })

      assert.deepStrictEqual(members, [
        {
          address: ownerAddress,
          displayName: 'Alice#5678',
          avatar: 'data:image/png;base64,alice',
          joinedAt: members[0].joinedAt,
        },
      ])
      assert.ok(new Date(members[0].joinedAt).getTime() > 0)
    })

    it('orders members by join time and refreshes profile fields', async () => {
      const alice = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const bob = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const channelName = `member-order-${uid}`
      await engine.createChannel(channelName, 'public', {
        ownerAddress: alice,
        displayName: 'Alice',
      })
      await new Promise(resolve => setTimeout(resolve, 5))
      await engine.createChannel(channelName, 'public', {
        ownerAddress: bob,
        displayName: 'Bob',
        avatar: 'bob.png',
      })
      await engine.sendMessage(channelName, 'hello', bob, 'Bobby', {
        ownerAddress: bob,
        avatar: 'bobby.png',
      })

      const members = engine.getChannelMembers(channelName, {
        ownerAddress: alice,
      })

      assert.deepStrictEqual(
        members.map(member => member.address),
        [alice, bob]
      )
      assert.strictEqual(members[1].displayName, 'Bobby')
      assert.strictEqual(members[1].avatar, 'bobby.png')
      assert.ok(
        new Date(members[0].joinedAt).getTime() <=
          new Date(members[1].joinedAt).getTime()
      )
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

    it('returns current channel member avatar with messages', async () => {
      const ch = `avatar-msg-${uid}`
      const author = '0x1234567890abcdef1234567890abcdef12345678'
      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Avatar Sender',
        avatar: 'old.png',
      })
      const msg = await msgEngine.sendMessage(
        ch,
        'Hello Avatar',
        author,
        'Avatar Sender',
        {
          ownerAddress: author,
          avatar: 'data:image/png;base64,msg-avatar',
        }
      )
      assert.strictEqual(msg.avatar, 'data:image/png;base64,msg-avatar')

      const messages = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      assert.strictEqual(messages[0].avatar, 'data:image/png;base64,msg-avatar')

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Fresh Sender',
        avatar: '/avatars/default/mint.svg',
      })
      const refreshed = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      assert.strictEqual(refreshed[0].authorName, 'Fresh Sender')
      assert.strictEqual(refreshed[0].avatar, '/avatars/default/mint.svg')

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'No Avatar Sender',
        avatar: '',
      })
      const cleared = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      assert.strictEqual(cleared[0].authorName, 'No Avatar Sender')
      assert.strictEqual(cleared[0].avatar, undefined)
    })

    it('stores channel attachment metadata', async () => {
      const ch = `attach-${uid}`
      const cid =
        'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
      const fileName = `chat-file/${ch}/photo.png`
      const link = `most://${cid}?filename=${encodeURIComponent(fileName)}`
      await msgEngine.createChannel(ch)

      const msg = await msgEngine.sendMessage(ch, link, undefined, undefined, {
        attachment: {
          kind: 'image',
          cid,
          fileName,
          link,
          mimeType: 'image/png',
          size: 123,
        },
      })

      assert.strictEqual(msg.attachment.kind, 'image')
      assert.strictEqual(msg.attachment.fileName, fileName)
      assert.strictEqual(msg.attachment.link, link)

      const messages = await msgEngine.getChannelMessages(ch)
      assert.deepStrictEqual(messages[0].attachment, msg.attachment)
    })

    it('normalizes old bare chat attachment filenames on read', async () => {
      const ch = `old-attach-${uid}`
      const cid =
        'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
      const fileName = '#18.txt'
      const link = `most://${cid}?filename=${encodeURIComponent(fileName)}`
      const normalizedFileName = `chat-file/${ch}/#18.txt`
      const normalizedLink = `most://${cid}?filename=${encodeURIComponent(normalizedFileName)}`
      await msgEngine.createChannel(ch)

      await msgEngine.sendMessage(ch, link, undefined, undefined, {
        attachment: {
          kind: 'text',
          cid,
          fileName,
          link,
          size: 18,
        },
      })

      const messages = await msgEngine.getChannelMessages(ch)
      assert.strictEqual(messages[0].attachment.fileName, normalizedFileName)
      assert.strictEqual(messages[0].attachment.link, normalizedLink)
      assert.strictEqual(messages[0].content, normalizedLink)
    })

    it('does not double-prefix normalized chat attachment filenames', async () => {
      const ch = `norm-attach-${uid}`
      const cid =
        'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
      const fileName = `chat-file/${ch}/a.txt`
      const link = `most://${cid}?filename=${encodeURIComponent(fileName)}`
      await msgEngine.createChannel(ch)

      await msgEngine.sendMessage(ch, link, undefined, undefined, {
        attachment: {
          kind: 'text',
          cid,
          fileName,
          link,
          size: 1,
        },
      })

      const messages = await msgEngine.getChannelMessages(ch)
      assert.strictEqual(messages[0].attachment.fileName, fileName)
      assert.strictEqual(messages[0].attachment.link, link)
      assert.strictEqual(messages[0].content, link)
    })

    it('rejects invalid attachment metadata', async () => {
      const ch = `bad-attach-${uid}`
      await msgEngine.createChannel(ch)

      await assert.rejects(
        msgEngine.sendMessage(ch, 'bad attachment', undefined, undefined, {
          attachment: {
            kind: 'image',
            cid: 'not-a-cid',
            fileName: 'chat-file/bad/photo.png',
            link: 'most://not-a-cid?filename=chat-file%2Fbad%2Fphoto.png',
          },
        }),
        /invalid_cid_format/
      )
    })

    it('emits one channel message event for a local append', async () => {
      const ch = `event-${uid}`
      const events = []
      let channelKey = ''
      const onMessage = data => {
        if (data.channel === channelKey) events.push(data)
      }

      msgEngine.on('channel:message', onMessage)
      try {
        const created = await msgEngine.createChannel(ch)
        channelKey = created.channelKey
        await msgEngine.sendMessage(ch, 'single event')
        await sleep(100)

        assert.strictEqual(events.length, 1)
        assert.strictEqual(events[0].message.content, 'single event')
      } finally {
        msgEngine.off('channel:message', onMessage)
      }
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

    it('keeps replies ordered when peer clocks differ', async () => {
      const clockTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-clock-test-')
      )
      const firstDataPath = path.join(clockTmpDir, 'first')
      const secondDataPath = path.join(clockTmpDir, 'second')
      const ch = `clock-${uid}`
      let firstEngine
      let secondEngine
      let replication

      try {
        firstEngine = new MostBoxEngine({
          dataPath: firstDataPath,
          disableNetwork: true,
        })
        secondEngine = new MostBoxEngine({
          dataPath: secondDataPath,
          disableNetwork: true,
        })
        await firstEngine.start()
        await secondEngine.start()

        await firstEngine.createChannel(ch, 'public')
        await secondEngine.createChannel(ch, 'public')
        replication = firstEngine.replicateWith(secondEngine)

        await withMockedDateNow(1000, () =>
          firstEngine.sendMessage(ch, 'A1')
        )
        await waitForChannelMessage(secondEngine, ch, 'A1')

        await withMockedDateNow(10000, () =>
          secondEngine.sendMessage(ch, 'B1')
        )
        await waitForChannelMessage(firstEngine, ch, 'B1')

        await withMockedDateNow(2000, () =>
          firstEngine.sendMessage(ch, 'A2')
        )
        await waitForChannelMessage(secondEngine, ch, 'A2')

        const firstMessages = await firstEngine.getChannelMessages(ch)
        const secondMessages = await secondEngine.getChannelMessages(ch)
        assert.deepStrictEqual(
          firstMessages.map(message => message.content),
          ['A1', 'B1', 'A2']
        )
        assert.deepStrictEqual(
          secondMessages.map(message => message.content),
          ['A1', 'B1', 'A2']
        )
        assert.ok(
          firstMessages[2].timestamp > firstMessages[1].timestamp,
          'follow-up message timestamp should advance past seen peer reply'
        )
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(clockTmpDir, { recursive: true, force: true })
      }
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
        /频道不存在/
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

  describe('setChannelRemark()', () => {
    it('sets a remark for a channel', async () => {
      await engine.createChannel(`remark-${uid}`, 'personal', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      const remark = engine.setChannelRemark(`remark-${uid}`, '我的备注', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      assert.strictEqual(remark, '我的备注')

      const channels = engine.listChannels({
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      const ch = channels.find(c => c.name === `remark-${uid}`)
      assert.strictEqual(ch.remark, '我的备注')
    })

    it('updates an existing remark', async () => {
      await engine.createChannel(`remark-up-${uid}`, 'personal', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      engine.setChannelRemark(`remark-up-${uid}`, '旧备注', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      const remark = engine.setChannelRemark(`remark-up-${uid}`, '新备注', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      assert.strictEqual(remark, '新备注')
    })

    it('clears remark when empty string provided', async () => {
      await engine.createChannel(`remark-cl-${uid}`, 'personal', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      engine.setChannelRemark(`remark-cl-${uid}`, '有备注', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      const remark = engine.setChannelRemark(`remark-cl-${uid}`, '', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      assert.strictEqual(remark, '')

      const channels = engine.listChannels({
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      const ch = channels.find(c => c.name === `remark-cl-${uid}`)
      assert.strictEqual(ch.remark, '')
    })

    it('throws for non-existent channel', async () => {
      assert.throws(
        () =>
          engine.setChannelRemark('nonexistent', 'test', {
            ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
          }),
        /频道不存在/
      )
    })

    it('throws for remark exceeding max length', async () => {
      await engine.createChannel(`remark-len-${uid}`, 'personal', {
        ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      })
      assert.throws(
        () =>
          engine.setChannelRemark(`remark-len-${uid}`, 'a'.repeat(51), {
            ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
          }),
        /备注最多 50 个字符/
      )
    })

    it('throws without ownerAddress', async () => {
      await engine.createChannel(`remark-no-${uid}`)
      assert.throws(
        () => engine.setChannelRemark(`remark-no-${uid}`, 'test'),
        /需要登录/
      )
    })
  })

  describe('setChannelPinned()', () => {
    it('sets a per-user pin flag for a channel', async () => {
      const ownerAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const otherAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const channelName = `pin-${uid}`
      await engine.createChannel(channelName, 'personal', { ownerAddress })

      const pinned = engine.setChannelPinned(channelName, true, { ownerAddress })

      assert.strictEqual(pinned, true)
      const ownerChannels = engine.listChannels({ ownerAddress })
      const otherChannels = engine.listChannels({ ownerAddress: otherAddress })
      assert.strictEqual(
        ownerChannels.find(c => c.name === channelName).pinned,
        true
      )
      assert.strictEqual(
        otherChannels.some(c => c.name === channelName),
        false
      )

      const unpinned = engine.setChannelPinned(channelName, false, { ownerAddress })
      assert.strictEqual(unpinned, false)
      assert.strictEqual(
        engine.listChannels({ ownerAddress }).find(c => c.name === channelName)
          .pinned,
        false
      )
    })

    it('throws without ownerAddress', async () => {
      await engine.createChannel(`pin-no-${uid}`)
      assert.throws(
        () => engine.setChannelPinned(`pin-no-${uid}`, true),
        /需要登录/
      )
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
    it('joins an existing channel by candidate identity', async () => {
      const created = await engine.createChannel(`join-${uid}`, 'group')
      const joined = await engine.joinChannel(
        `join-${uid}`,
        toChannelCandidate(created)
      )
      assert.strictEqual(joined.name, `join-${uid}`)
      assert.strictEqual(joined.key, created.key)

      const channels = engine.listChannels()
      assert.ok(channels.find(c => c.name === `join-${uid}`))
    })

    it('creates a new channel when no candidate is supplied', async () => {
      const joined = await engine.joinChannel(`new-join-${uid}`)
      assert.strictEqual(joined.name, `new-join-${uid}`)
      assert.ok(joined.channelKey)
    })

    it('returns existing if already joined', async () => {
      await engine.createChannel(`existing-join-${uid}`)
      const r1 = await engine.joinChannel(`existing-join-${uid}`)
      const r2 = await engine.joinChannel(`existing-join-${uid}`)
      assert.strictEqual(r1.key, r2.key)
    })

    it('creates a writable local writer core when joining another channel', async () => {
      const joinTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-join-channel-test-')
      )
      const joinDataPath = path.join(joinTmpDir, 'data')
      fs.mkdirSync(joinDataPath, { recursive: true })
      const joinEngine = new MostBoxEngine({
        dataPath: joinDataPath,
        disableNetwork: true,
      })

      try {
        await joinEngine.start()
        const channelName = `remote-join-${uid}`
        const created = await engine.createChannel(channelName)
        const joined = await joinEngine.joinChannel(
          channelName,
          toChannelCandidate(created)
        )

        assert.strictEqual(joined.name, channelName)
        assert.strictEqual(joined.key, created.key)
        assert.notStrictEqual(
          joined.localWriterCoreKey,
          created.localWriterCoreKey
        )

        const message = await joinEngine.sendMessage(
          channelName,
          'hello from joiner',
          '0x1234567890abcdef1234567890abcdef12345678',
          'Joiner'
        )
        assert.strictEqual(message.content, 'hello from joiner')

        const messages = await joinEngine.getChannelMessages(channelName)
        assert.strictEqual(messages.length, 1)
        assert.strictEqual(messages[0].content, 'hello from joiner')

        const metadataPath = path.join(joinDataPath, 'channels.json')
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
        const channel = metadata.find(c => c.name === channelName)
        assert.ok(channel.writerCoreKeys.includes(created.localWriterCoreKey))
        assert.strictEqual(channel.channelKey, joined.key)
      } finally {
        await joinEngine.stop().catch(() => {})
        fs.rmSync(joinTmpDir, { recursive: true, force: true })
      }
    })

    it('uses the same channel identity for independent joins by short ID', async () => {
      const mergeTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-plain-id-test-')
      )
      const firstDataPath = path.join(mergeTmpDir, 'first')
      const secondDataPath = path.join(mergeTmpDir, 'second')
      const channelName = `stable-${uid}`
      let firstEngine
      let secondEngine
      let replication

      try {
        firstEngine = new MostBoxEngine({
          dataPath: firstDataPath,
          disableNetwork: true,
        })
        secondEngine = new MostBoxEngine({
          dataPath: secondDataPath,
          disableNetwork: true,
        })
        await firstEngine.start()
        await secondEngine.start()

        const first = await firstEngine.createChannel(channelName, 'public')
        const second = await secondEngine.createChannel(channelName, 'public')

        assert.strictEqual(first.channelKey, channelName)
        assert.strictEqual(second.channelKey, channelName)
        assert.strictEqual(first.channelKey, second.channelKey)

        await firstEngine.sendMessage(first.channelKey, 'from first')
        await secondEngine.sendMessage(second.channelKey, 'from second')
        await firstEngine.joinChannel(channelName, toChannelCandidate(second))
        await secondEngine.joinChannel(channelName, toChannelCandidate(first))

        replication = firstEngine.replicateWith(secondEngine)
        await waitForChannelMessage(secondEngine, second.channelKey, 'from first')
        await waitForChannelMessage(firstEngine, first.channelKey, 'from second')

        const firstMessages = await firstEngine.getChannelMessages(first.channelKey)
        const secondMessages = await secondEngine.getChannelMessages(
          second.channelKey
        )
        assert.deepStrictEqual(
          firstMessages.map(message => message.content).sort(),
          ['from first', 'from second']
        )
        assert.deepStrictEqual(
          secondMessages.map(message => message.content).sort(),
          ['from first', 'from second']
        )
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(mergeTmpDir, { recursive: true, force: true })
      }
    })

    it('exchanges new channel writer cores over an existing peer connection', async () => {
      const sequenceTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-sequence-test-')
      )
      const firstDataPath = path.join(sequenceTmpDir, 'first')
      const secondDataPath = path.join(sequenceTmpDir, 'second')
      const channelNames = [`seq-a-${uid}`, `seq-b-${uid}`]
      let firstEngine
      let secondEngine
      let replication

      try {
        firstEngine = new MostBoxEngine({
          dataPath: firstDataPath,
          disableNetwork: true,
        })
        secondEngine = new MostBoxEngine({
          dataPath: secondDataPath,
          disableNetwork: true,
        })
        await firstEngine.start()
        await secondEngine.start()
        replication = firstEngine.replicateWith(secondEngine)

        for (const channelName of channelNames) {
          const first = await firstEngine.createChannel(channelName, 'public', {
            discover: true,
            discoveryTimeout: 25,
          })
          await sleep(25)
          const second = await secondEngine.createChannel(channelName, 'public', {
            discover: true,
            discoveryTimeout: 25,
          })

          assert.strictEqual(first.channelKey, channelName)
          assert.strictEqual(second.channelKey, channelName)

          const firstMessage = `from first ${channelName}`
          const secondMessage = `from second ${channelName}`
          await firstEngine.sendMessage(first.channelKey, firstMessage)
          await secondEngine.sendMessage(second.channelKey, secondMessage)

          await waitForChannelMessage(
            secondEngine,
            second.channelKey,
            firstMessage
          )
          await waitForChannelMessage(
            firstEngine,
            first.channelKey,
            secondMessage
          )
        }
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(sequenceTmpDir, { recursive: true, force: true })
      }
    })

    it('merges messages from multiple writer cores in one channel', async () => {
      const mergeTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-merge-test-')
      )
      const sourceDataPath = path.join(mergeTmpDir, 'source')
      const joinDataPath = path.join(mergeTmpDir, 'joiner')
      const channelName = `merge-${uid}`
      let sourceEngine
      let joinEngine
      let replication

      try {
        sourceEngine = new MostBoxEngine({
          dataPath: sourceDataPath,
          disableNetwork: true,
        })
        joinEngine = new MostBoxEngine({
          dataPath: joinDataPath,
          disableNetwork: true,
        })
        await sourceEngine.start()
        await joinEngine.start()

        const created = await sourceEngine.createChannel(channelName)
        await sourceEngine.sendMessage(created.channelKey, 'from source')

        const joined = await joinEngine.joinChannel(
          channelName,
          toChannelCandidate(created)
        )
        await joinEngine.sendMessage(joined.channelKey, 'from joiner')
        await sourceEngine.joinChannel(channelName, toChannelCandidate(joined))

        replication = sourceEngine.replicateWith(joinEngine)
        await waitForChannelMessage(joinEngine, joined.channelKey, 'from source')
        await waitForChannelMessage(sourceEngine, created.channelKey, 'from joiner')

        const messages = await sourceEngine.getChannelMessages(created.channelKey)
        assert.deepStrictEqual(
          messages.map(message => message.content),
          ['from source', 'from joiner']
        )
      } finally {
        replication?.close()
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (joinEngine) await joinEngine.stop().catch(() => {})
        fs.rmSync(mergeTmpDir, { recursive: true, force: true })
      }
    })

    it('reopens persisted remote channel cores after restart', async () => {
      const restartTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-remote-core-restart-')
      )
      const sourceDataPath = path.join(restartTmpDir, 'source')
      const joinDataPath = path.join(restartTmpDir, 'joiner')
      const channelName = `hist-${uid}`
      let sourceEngine
      let joinEngine
      let replication

      try {
        sourceEngine = new MostBoxEngine({
          dataPath: sourceDataPath,
          disableNetwork: true,
        })
        joinEngine = new MostBoxEngine({
          dataPath: joinDataPath,
          disableNetwork: true,
        })
        await sourceEngine.start()
        await joinEngine.start()

        const created = await sourceEngine.createChannel(channelName)
        await sourceEngine.sendMessage(
          channelName,
          'before joiner restart',
          '0x1234567890abcdef1234567890abcdef12345678',
          'Source'
        )
        await joinEngine.joinChannel(channelName, toChannelCandidate(created))
        replication = sourceEngine.replicateWith(joinEngine)
        await waitForChannelMessage(
          joinEngine,
          channelName,
          'before joiner restart'
        )

        replication.close()
        replication = null
        await joinEngine.stop()
        joinEngine = new MostBoxEngine({
          dataPath: joinDataPath,
          disableNetwork: true,
        })
        await joinEngine.start()

        const messages = await joinEngine.getChannelMessages(channelName)
        assert.ok(
          messages.some(message => message.content === 'before joiner restart')
        )
      } finally {
        replication?.close()
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (joinEngine) await joinEngine.stop().catch(() => {})
        fs.rmSync(restartTmpDir, { recursive: true, force: true })
      }
    })

    it('keeps a joined channel writable after restart', async () => {
      const restartTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-join-restart-test-')
      )
      const restartDataPath = path.join(restartTmpDir, 'data')
      fs.mkdirSync(restartDataPath, { recursive: true })
      const channelName = `join-restart-${uid}`
      const created = await engine.createChannel(channelName)
      let joinedKey
      let joinedWriterKey
      let joinEngine = new MostBoxEngine({
        dataPath: restartDataPath,
        disableNetwork: true,
      })

      try {
        await joinEngine.start()
        const joined = await joinEngine.joinChannel(
          channelName,
          toChannelCandidate(created)
        )
        joinedKey = joined.key
        joinedWriterKey = joined.localWriterCoreKey
        await joinEngine.sendMessage(
          channelName,
          'before restart',
          '0x1234567890abcdef1234567890abcdef12345678',
          'Joiner'
        )
        await joinEngine.stop()

        joinEngine = new MostBoxEngine({
          dataPath: restartDataPath,
          disableNetwork: true,
        })
        await joinEngine.start()
        const channels = joinEngine.listChannels()
        const channel = channels.find(c => c.name === channelName)

        assert.ok(channel)
        assert.strictEqual(channel.channelKey, joinedKey)
        assert.strictEqual(channel.localWriterCoreKey, joinedWriterKey)

        await joinEngine.sendMessage(
          channelName,
          'after restart',
          '0x1234567890abcdef1234567890abcdef12345678',
          'Joiner'
        )

        const messages = await joinEngine.getChannelMessages(channelName)
        assert.deepStrictEqual(
          messages.map(message => message.content),
          ['before restart', 'after restart']
        )
      } finally {
        await joinEngine.stop().catch(() => {})
        fs.rmSync(restartTmpDir, { recursive: true, force: true })
      }
    })

    it('does not persist transient game channels', async () => {
      const restartTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-game-channel-persist-')
      )
      const restartDataPath = path.join(restartTmpDir, 'data')
      const chatChannelName = `persist-chat-${uid}`
      const gameChannelName = gameRoomCodeToChannelName('gandengyan', 'ABCD12')
      const restartEngine = new MostBoxEngine({
        dataPath: restartDataPath,
        disableNetwork: true,
      })

      try {
        await restartEngine.start()
        await restartEngine.createChannel(chatChannelName, 'public')
        await restartEngine.createChannel(gameChannelName, GAME_CHANNEL_TYPE)
        let metadata = JSON.parse(
          fs.readFileSync(path.join(restartDataPath, 'channels.json'), 'utf-8')
        )
        assert.ok(metadata.some(c => c.name === chatChannelName))
        assert.ok(!metadata.some(c => c.name === gameChannelName))
      } finally {
        await restartEngine.stop().catch(() => {})
        fs.rmSync(restartTmpDir, { recursive: true, force: true })
      }
    })
  })
})
