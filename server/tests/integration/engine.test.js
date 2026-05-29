import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { CID } from 'multiformats/cid'
import { MostBoxEngine } from '../../src/index.js'
import { calculateCid } from '../../src/core/cid.js'
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
        /Invalid CID format/
      )
    })

    it('rejects empty link', async () => {
      await assert.rejects(
        engine.downloadFile(''),
        /Link must be a non-empty string/
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
