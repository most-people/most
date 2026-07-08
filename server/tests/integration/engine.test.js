import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hypercore from 'hypercore'
import HypercoreError from 'hypercore-errors'
import { CID } from 'multiformats/cid'
import { MostBoxEngine } from '../../src/index.js'
import { calculateCid } from '../../src/core/cid.js'
import { getCidInfo } from '../../src/core/cidTopic.js'
import {
  GAME_CHANNEL_TYPE,
  createGameEvent,
  deriveGameRoomLobby,
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

async function waitForChannelPeerAddress(
  engine,
  channelName,
  address,
  options = {},
  timeout = 5000
) {
  const expected = String(address || '').toLowerCase()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const peers = engine.getChannelPeers(channelName, options)
    const peer = peers.find(item =>
      item.memberAddresses?.some(member => member.toLowerCase() === expected)
    )
    if (peer) return peer
    await sleep(25)
  }
  throw new Error(
    `Channel ${channelName} did not report online peer ${address}`
  )
}

async function waitForChannelMember(
  engine,
  channelName,
  address,
  options = {},
  timeout = 5000
) {
  const expected = String(address || '').toLowerCase()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const channel = engine
      .listChannels(options)
      .find(item => item.name === channelName || item.channelKey === channelName)
    const member = channel?.members?.find(
      item => String(item.address || '').toLowerCase() === expected
    )
    if (member) return member
    await sleep(25)
  }
  throw new Error(`Channel ${channelName} did not report member ${address}`)
}

async function waitForChannelPresenceAddress(
  engine,
  channelName,
  address,
  options = {},
  timeout = 5000
) {
  const expected = String(address || '').toLowerCase()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const presence = engine.getChannelPresence(channelName, options)
    const entry = presence.find(item => item.address.toLowerCase() === expected)
    if (entry?.online) return entry
    await sleep(25)
  }
  throw new Error(`Channel ${channelName} did not report presence ${address}`)
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
    members: channel.members,
  }
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

    it('reopens the drive when publish sees a closed session', async () => {
      const content = Buffer.from('publish after closed drive session')
      const { cid } = await calculateCid(content)
      const cidString = cid.toString()
      const originalCreateWriteStream = Hyperdrive.prototype.createWriteStream
      let injected = false

      Hyperdrive.prototype.createWriteStream =
        function createWriteStreamWithClosedSession(name, opts) {
          if (!injected && name === `/${cidString}`) {
            injected = true
            throw HypercoreError.SESSION_CLOSED(
              'Cannot append to a closed session',
              this.discoveryKey
            )
          }
          return originalCreateWriteStream.call(this, name, opts)
        }

      try {
        const result = await engine.publishFile(content, 'closed-drive.txt')
        const stored = await engine.readFileRaw(result.cid, { public: true })

        assert.strictEqual(injected, true)
        assert.strictEqual(result.cid, cidString)
        assert.deepStrictEqual(stored.buffer, content)
      } finally {
        Hyperdrive.prototype.createWriteStream = originalCreateWriteStream
      }
    })

    it('reopens the drive when checking local CID content sees a closed session', async () => {
      const result = await engine.publishFile(
        Buffer.from('local check after closed drive session'),
        'closed-local-check.txt'
      )
      const originalEntry = Hyperdrive.prototype.entry
      let injected = false

      Hyperdrive.prototype.entry = async function entryWithClosedSession(
        name,
        opts
      ) {
        if (!injected && name === `/${result.cid}`) {
          injected = true
          throw HypercoreError.SESSION_CLOSED(
            'Cannot append to a closed session',
            this.discoveryKey
          )
        }
        return originalEntry.call(this, name, opts)
      }

      try {
        const availability = await engine.getLocalCidAvailability(result.link)

        assert.strictEqual(injected, true)
        assert.ok(availability)
        assert.strictEqual(availability.cid, result.cid)
        assert.strictEqual(availability.localAvailable, true)
      } finally {
        Hyperdrive.prototype.entry = originalEntry
      }
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

    it('rewrites content when an existing CID record has no local blocks', async () => {
      const repairTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-publish-repair-')
      )
      const dataPath = path.join(repairTmpDir, 'data')
      const content = Buffer.from('repair metadata-only duplicate publish')
      const { cid } = await calculateCid(content)
      const cidString = cid.toString()
      const { driveName } = getCidInfo(cidString)
      let setupEngine
      let repairEngine

      try {
        setupEngine = new MostBoxEngine({
          dataPath,
          disableNetwork: true,
          downloadTimeout: 100,
        })
        await setupEngine.start()
        await setupEngine.stop()
        setupEngine = null

        fs.writeFileSync(
          path.join(dataPath, 'published-files.json'),
          JSON.stringify(
            {
              __local__: [
                {
                  fileName: 'chat-file/old/repair.jpg',
                  cid: cidString,
                  driveName,
                  size: content.length,
                  source: 'published',
                  publishedAt: new Date().toISOString(),
                  starred: false,
                },
              ],
            },
            null,
            2
          )
        )

        repairEngine = new MostBoxEngine({
          dataPath,
          disableNetwork: true,
          downloadTimeout: 100,
        })
        await repairEngine.start()

        const result = await repairEngine.publishFile(
          content,
          'chat-file/new/repair.jpg'
        )
        const readResult = await repairEngine.readFileRaw(cidString, {
          public: true,
        })

        assert.strictEqual(result.cid, cidString)
        assert.strictEqual(result.fileName, 'chat-file/new/repair.jpg')
        assert.deepStrictEqual(readResult.buffer, content)
      } finally {
        if (setupEngine) await setupEngine.stop().catch(() => {})
        if (repairEngine) await repairEngine.stop().catch(() => {})
        fs.rmSync(repairTmpDir, { recursive: true, force: true })
      }
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

  describe('publishCollection()', () => {
    it('shares a file-library folder as a UnixFS directory collection', async () => {
      const folderName = `share-folder-${uid}`
      const first = await engine.publishFile(
        Buffer.from(`share folder first ${uid}`),
        `${folderName}/S01E01.txt`
      )
      const second = await engine.publishFile(
        Buffer.from(`share folder second ${uid}`),
        `${folderName}/S01E02.txt`
      )

      const result = await engine.shareFolder(folderName)

      assert.strictEqual(result.kind, 'collection')
      assert.strictEqual(result.fileName, folderName)
      assert.strictEqual(result.fileCount, 2)
      assert.deepStrictEqual(
        result.files.map(file => file.path),
        ['S01E01.txt', 'S01E02.txt']
      )
      assert.strictEqual(
        result.link,
        `most://${result.cid}?filename=${folderName}`
      )

      const holdings = engine.listHoldings()
      assert.ok(holdings.some(holding => holding.cid === result.cid))
      assert.ok(holdings.some(holding => holding.cid === first.cid))
      assert.ok(holdings.some(holding => holding.cid === second.cid))

      const collection = await engine.getCollection(result.cid)
      assert.ok(collection.files.every(file => file.localAvailable === true))
    })

    it('keeps a collection manifest seeded after all child files are deleted', async () => {
      const folderName = `virtual-folder-${uid}`
      const first = await engine.publishFile(
        Buffer.from(`virtual folder first ${uid}`),
        `${folderName}/one.txt`
      )
      const second = await engine.publishFile(
        Buffer.from(`virtual folder second ${uid}`),
        `${folderName}/two.txt`
      )

      const result = await engine.shareFolder(folderName)

      await engine.deletePublishedFile(first.cid)
      await engine.deletePublishedFile(second.cid)

      const holdings = engine.listHoldings()
      assert.ok(
        holdings.some(
          holding => holding.cid === result.cid && holding.kind === 'collection'
        )
      )
      assert.ok(!holdings.some(holding => holding.cid === first.cid))
      assert.ok(!holdings.some(holding => holding.cid === second.cid))

      const collection = await engine.getCollection(result.cid)
      assert.deepStrictEqual(
        collection.files.map(file => file.path),
        ['one.txt', 'two.txt']
      )
      assert.ok(collection.files.every(file => file.localAvailable === false))

      const availability = await engine.checkDownloadAvailability(result.link, {
        timeout: 100,
      })
      assert.strictEqual(availability.available, true)
      assert.strictEqual(availability.kind, 'collection')
      assert.strictEqual(availability.availabilityScope, 'collection-manifest')
      assert.strictEqual(availability.localAvailableCount, 0)
      assert.strictEqual(availability.missingLocalCount, 2)
      assert.ok(availability.files.every(file => file.localAvailable === false))

      const publishedCollection = await engine.publishCollection(
        [
          {
            path: 'Published/only.txt',
            content: Buffer.from(`published collection ${uid}`),
          },
        ],
        `published-collection-${uid}`
      )

      assert.ok(
        engine
          .listHoldings()
          .some(holding => holding.cid === publishedCollection.cid)
      )

      await engine.deletePublishedFile(publishedCollection.cid)

      assert.ok(
        !engine
          .listHoldings()
          .some(holding => holding.cid === publishedCollection.cid)
      )
    })

    it('rejects sharing a folder with files that are not locally readable', async () => {
      const shareTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-share-folder-missing-')
      )
      const owner = '0x5151515151515151515151515151515151515151'
      let sourceEngine
      let targetEngine

      try {
        sourceEngine = new MostBoxEngine({
          dataPath: path.join(shareTmpDir, 'source'),
          disableNetwork: true,
        })
        targetEngine = new MostBoxEngine({
          dataPath: path.join(shareTmpDir, 'target'),
          disableNetwork: true,
        })
        await sourceEngine.start()
        await targetEngine.start()

        await sourceEngine.publishFile(
          Buffer.from('metadata only folder item'),
          'metadata-only/file.txt',
          { ownerAddress: owner }
        )
        await targetEngine.importUserData(
          owner,
          sourceEngine.exportUserData(owner)
        )

        await assert.rejects(
          targetEngine.shareFolder('metadata-only', { ownerAddress: owner }),
          /not locally available/
        )
      } finally {
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (targetEngine) await targetEngine.stop().catch(() => {})
        fs.rmSync(shareTmpDir, { recursive: true, force: true })
      }
    })

    it('publishes a UnixFS directory collection and seeds child files', async () => {
      const result = await engine.publishCollection(
        [
          { path: 'Show/S01E01.txt', content: Buffer.from('episode 1') },
          { path: 'Show/S01E02.txt', content: Buffer.from('episode 2') },
        ],
        'Show'
      )

      assert.strictEqual(result.kind, 'collection')
      assert.strictEqual(result.fileName, 'Show')
      assert.strictEqual(result.fileCount, 2)
      assert.strictEqual(result.files.length, 2)
      assert.ok(result.cid.startsWith('bafy'))
      assert.strictEqual(result.link, `most://${result.cid}?filename=Show`)

      const records = engine
        .listPublishedFiles()
        .filter(file => file.cid === result.cid)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0].kind, 'collection')
      assert.strictEqual(records[0].fileCount, 2)
      assert.strictEqual(records[0].localAvailable, true)

      const childHoldings = result.files.map(file =>
        engine.listHoldings().find(holding => holding.cid === file.cid)
      )
      assert.ok(childHoldings.every(Boolean))
      assert.ok(
        engine.listHoldings().some(holding => holding.cid === result.cid)
      )
    })

    it('reads collection files with local availability from holdings', async () => {
      const result = await engine.publishCollection(
        [
          { path: 'Show/S01E01.txt', content: Buffer.from('episode 1') },
          { path: 'Show/S01E02.txt', content: Buffer.from('episode 2') },
        ],
        'Show'
      )

      const collection = await engine.getCollection(result.cid)

      assert.strictEqual(collection.kind, 'collection')
      assert.strictEqual(collection.cid, result.cid)
      assert.deepStrictEqual(
        collection.files.map(file => file.path),
        ['S01E01.txt', 'S01E02.txt']
      )
      assert.ok(collection.files.every(file => file.localAvailable === true))
      assert.ok(collection.files.every(file => file.seedStatus === 'active'))
    })

    it('downloads selected collection files and leaves others unavailable', async () => {
      const collectionTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-collection-partial-')
      )
      let publisher
      let downloader
      let replication

      try {
        publisher = new MostBoxEngine({
          dataPath: path.join(collectionTmpDir, 'publisher'),
          downloadTimeout: 5000,
        })
        downloader = new MostBoxEngine({
          dataPath: path.join(collectionTmpDir, 'downloader'),
          downloadTimeout: 5000,
        })
        await publisher.start()
        await downloader.start()

        const publishResult = await publisher.publishCollection(
          [
            { path: 'Show/S01E01.txt', content: Buffer.from('episode 1') },
            { path: 'Show/S01E02.txt', content: Buffer.from('episode 2') },
          ],
          'Show'
        )
        const download = downloader.downloadFile(publishResult.link, null, {
          selectedPaths: ['S01E02.txt'],
        })

        await sleep(100)
        replication = publisher.replicateWith(downloader)
        const result = await download
        const collection = await downloader.getCollection(publishResult.cid)

        assert.strictEqual(result.kind, 'collection')
        assert.deepStrictEqual(
          result.files.map(file => file.path),
          ['S01E02.txt']
        )
        assert.strictEqual(
          collection.files.find(file => file.path === 'S01E01.txt')
            .localAvailable,
          false
        )
        assert.strictEqual(
          collection.files.find(file => file.path === 'S01E02.txt')
            .localAvailable,
          true
        )
      } finally {
        replication?.close()
        if (publisher) await publisher.stop().catch(() => {})
        if (downloader) await downloader.stop().catch(() => {})
        fs.rmSync(collectionTmpDir, { recursive: true, force: true })
      }
    })

    it('adds downloaded collection children to the file library folder', async () => {
      const folderTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-collection-folder-')
      )
      let publisher
      let downloader
      let replication

      try {
        publisher = new MostBoxEngine({
          dataPath: path.join(folderTmpDir, 'publisher'),
          downloadTimeout: 5000,
        })
        downloader = new MostBoxEngine({
          dataPath: path.join(folderTmpDir, 'downloader'),
          downloadTimeout: 5000,
        })
        await publisher.start()
        await downloader.start()

        const publishResult = await publisher.publishCollection(
          [
            { path: 'Shots/one.txt', content: Buffer.from('one') },
            { path: 'Shots/two.txt', content: Buffer.from('two') },
          ],
          'Shots'
        )

        const download = downloader.downloadFile(publishResult.link, null, {
          timeout: 5000,
        })
        await sleep(100)
        replication = publisher.replicateWith(downloader)
        await download

        const records = downloader.listPublishedFiles()
        assert.deepStrictEqual(records.map(file => file.fileName).sort(), [
          'Shots/one.txt',
          'Shots/two.txt',
        ])
        assert.strictEqual(
          records.some(file => file.cid === publishResult.cid),
          false
        )
        const rootHolding = downloader
          .listHoldings()
          .find(holding => holding.cid === publishResult.cid)
        assert.ok(rootHolding)
        assert.strictEqual(rootHolding.size, 0)
        const localAvailability = await downloader.getLocalCidAvailability(
          publishResult.link
        )
        assert.strictEqual(localAvailability.alreadyExists, true)
        const downloadAvailability = await downloader.checkDownloadAvailability(
          publishResult.link,
          { timeout: 100 }
        )
        assert.strictEqual(downloadAvailability.alreadyExists, true)
        const repeatDownload = await downloader.downloadFile(
          publishResult.link,
          null,
          {
            timeout: 100,
          }
        )
        assert.strictEqual(repeatDownload.alreadyExists, true)
        assert.strictEqual(repeatDownload.kind, 'collection')
      } finally {
        replication?.close()
        if (publisher) await publisher.stop().catch(() => {})
        if (downloader) await downloader.stop().catch(() => {})
        fs.rmSync(folderTmpDir, { recursive: true, force: true })
      }
    })

    it('does not leave a collection library record when child download fails', async () => {
      const failureTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-collection-failure-')
      )
      let publisher
      let downloader
      let replication

      try {
        publisher = new MostBoxEngine({
          dataPath: path.join(failureTmpDir, 'publisher'),
          downloadTimeout: 100,
        })
        downloader = new MostBoxEngine({
          dataPath: path.join(failureTmpDir, 'downloader'),
          downloadTimeout: 100,
        })
        await publisher.start()
        await downloader.start()

        const publishResult = await publisher.publishCollection(
          [{ path: 'Broken/only.txt', content: Buffer.from('missing child') }],
          'Broken',
          { seedChildFiles: false }
        )

        const download = downloader.downloadFile(publishResult.link, null, {
          timeout: 100,
        })
        await sleep(100)
        replication = publisher.replicateWith(downloader)
        await assert.rejects(download, /not found|peers|file data/i)

        assert.strictEqual(
          downloader
            .listPublishedFiles()
            .some(file => file.cid === publishResult.cid),
          false
        )
        assert.strictEqual(
          downloader
            .listHoldings()
            .some(holding => holding.cid === publishResult.cid),
          false
        )
      } finally {
        replication?.close()
        if (publisher) await publisher.stop().catch(() => {})
        if (downloader) await downloader.stop().catch(() => {})
        fs.rmSync(failureTmpDir, { recursive: true, force: true })
      }
    })

    it('keeps collection children that finished before a later child fails', async () => {
      const partialTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-collection-partial-')
      )
      let publisher
      let downloader
      let replication

      try {
        publisher = new MostBoxEngine({
          dataPath: path.join(partialTmpDir, 'publisher'),
          downloadTimeout: 500,
        })
        downloader = new MostBoxEngine({
          dataPath: path.join(partialTmpDir, 'downloader'),
          downloadTimeout: 500,
        })
        await publisher.start()
        await downloader.start()

        const firstContent = Buffer.from('downloaded child')
        const publishResult = await publisher.publishCollection(
          [
            { path: 'Partial/one.txt', content: firstContent },
            { path: 'Partial/two.txt', content: Buffer.from('missing child') },
          ],
          'Partial',
          { seedChildFiles: false }
        )
        await publisher.publishFile(firstContent, 'one.txt', {
          addToLibrary: false,
        })

        const taskId = 'collection-partial-download'
        const progressEvents = []
        const successEvents = []
        downloader.on('download:progress', event => {
          if (event.taskId === taskId) progressEvents.push(event)
        })
        downloader.on('download:success', event => {
          successEvents.push(event)
        })

        const download = downloader.downloadFile(publishResult.link, taskId, {
          timeout: 500,
        })
        await sleep(100)
        replication = publisher.replicateWith(downloader)
        await assert.rejects(download, /not found|peers|file data/i)

        const records = downloader.listPublishedFiles()
        assert.deepStrictEqual(records.map(file => file.fileName).sort(), [
          'Partial/one.txt',
        ])
        assert.strictEqual(
          records.some(file => file.cid === publishResult.cid),
          false
        )
        assert.strictEqual(
          downloader
            .listHoldings()
            .some(holding => holding.cid === publishResult.cid),
          false
        )
        assert.deepStrictEqual(
          progressEvents.map(event => ({
            collection: event.collection,
            completedFiles: event.completedFiles,
            totalFiles: event.totalFiles,
            percent: event.percent,
          })),
          [
            {
              collection: true,
              completedFiles: 1,
              totalFiles: 2,
              percent: 50,
            },
          ]
        )
        assert.deepStrictEqual(
          successEvents.filter(event =>
            String(event.taskId || '').startsWith(`${taskId}_`)
          ),
          []
        )
      } finally {
        replication?.close()
        if (publisher) await publisher.stop().catch(() => {})
        if (downloader) await downloader.stop().catch(() => {})
        fs.rmSync(partialTmpDir, { recursive: true, force: true })
      }
    })

    it('relays collection files from downloaded seed nodes after the publisher stops', async () => {
      const relayTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-collection-relay-')
      )
      const engines = []
      const links = []

      try {
        const makeEngine = async name => {
          const nextEngine = new MostBoxEngine({
            dataPath: path.join(relayTmpDir, name),
            downloadTimeout: 7000,
          })
          await nextEngine.start()
          engines.push(nextEngine)
          return nextEngine
        }

        const publisher = await makeEngine('publisher')
        const partialSeed = await makeEngine('partial-seed')
        const partialLeecher = await makeEngine('partial-leecher')
        const fullSeed = await makeEngine('full-seed')
        const fullLeecher = await makeEngine('full-leecher')

        const publishResult = await publisher.publishCollection(
          [
            { path: 'RelayShow/S01E01.txt', content: Buffer.from('episode 1') },
            { path: 'RelayShow/S01E02.txt', content: Buffer.from('episode 2') },
          ],
          'RelayShow'
        )

        const partialSeedDownload = partialSeed.downloadFile(
          publishResult.link,
          null,
          {
            selectedPaths: ['S01E02.txt'],
            timeout: 7000,
          }
        )
        await sleep(100)
        links.push(publisher.replicateWith(partialSeed))
        await partialSeedDownload

        const fullSeedDownload = fullSeed.downloadFile(
          publishResult.link,
          null,
          {
            timeout: 7000,
          }
        )
        await sleep(100)
        links.push(publisher.replicateWith(fullSeed))
        await fullSeedDownload

        await publisher.stop()
        engines.splice(engines.indexOf(publisher), 1)

        const partialRelayDownload = partialLeecher.downloadFile(
          publishResult.link,
          null,
          {
            selectedPaths: ['S01E02.txt'],
            timeout: 7000,
          }
        )
        await sleep(100)
        links.push(partialSeed.replicateWith(partialLeecher))
        const partialRelayResult = await partialRelayDownload

        const fullRelayDownload = fullLeecher.downloadFile(
          publishResult.link,
          null,
          {
            timeout: 7000,
          }
        )
        await sleep(100)
        links.push(fullSeed.replicateWith(fullLeecher))
        const fullRelayResult = await fullRelayDownload

        assert.deepStrictEqual(
          partialRelayResult.files.map(file => file.path),
          ['S01E02.txt']
        )
        assert.deepStrictEqual(
          fullRelayResult.files.map(file => file.path),
          ['S01E01.txt', 'S01E02.txt']
        )

        const partialCollection = await partialLeecher.getCollection(
          publishResult.cid
        )
        assert.strictEqual(
          partialCollection.files.find(file => file.path === 'S01E01.txt')
            .localAvailable,
          false
        )
        assert.strictEqual(
          partialCollection.files.find(file => file.path === 'S01E02.txt')
            .localAvailable,
          true
        )

        const fullCollection = await fullLeecher.getCollection(
          publishResult.cid
        )
        assert.ok(
          fullCollection.files.every(file => file.localAvailable === true)
        )
      } finally {
        for (const link of links) link.close()
        await Promise.allSettled(engines.map(nextEngine => nextEngine.stop()))
        fs.rmSync(relayTmpDir, { recursive: true, force: true })
      }
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
      await assert.rejects(engine.downloadFile(''), /link_empty/)
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

    it('does not resume missing local content as an active seed', async () => {
      const missingTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-missing-holding-')
      )
      const dataPath = path.join(missingTmpDir, 'data')
      const content = Buffer.from('missing holding content')
      const { cid } = await calculateCid(content)
      const cidString = cid.toString()
      const { topicHex, driveName } = getCidInfo(cidString)
      let setupEngine
      let missingEngine

      try {
        setupEngine = new MostBoxEngine({
          dataPath,
          disableNetwork: true,
          downloadTimeout: 100,
        })
        await setupEngine.start()
        await setupEngine.stop()
        setupEngine = null

        fs.writeFileSync(
          path.join(dataPath, 'node-holdings.json'),
          JSON.stringify(
            [
              {
                cid: cidString,
                fileName: 'missing.txt',
                size: content.length,
                topic: topicHex,
                driveName,
                source: 'published',
              },
            ],
            null,
            2
          )
        )

        missingEngine = new MostBoxEngine({
          dataPath,
          disableNetwork: true,
          downloadTimeout: 100,
        })
        await missingEngine.start()

        const missing = await waitForHoldingStatus(
          missingEngine,
          cidString,
          'error',
          1000
        )
        assert.strictEqual(missing.joined, false)
        assert.match(missing.seedError, /Local CID content missing/)
      } finally {
        if (setupEngine) await setupEngine.stop().catch(() => {})
        if (missingEngine) await missingEngine.stop().catch(() => {})
        fs.rmSync(missingTmpDir, { recursive: true, force: true })
      }
    })

    it('does not report queued holdings as locally available before resume verifies them', async () => {
      const queuedTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-queued-holding-')
      )
      const dataPath = path.join(queuedTmpDir, 'data')
      let firstEngine
      let secondEngine
      const originalEntry = Hyperdrive.prototype.entry

      try {
        firstEngine = new MostBoxEngine({ dataPath })
        await firstEngine.start()
        const published = await firstEngine.publishFile(
          Buffer.from('queued local availability'),
          'queued.txt'
        )
        await firstEngine.stop()
        firstEngine = null

        Hyperdrive.prototype.entry = async function delayedEntry(...args) {
          if (String(args[0] || '') === `/${published.cid}`) {
            await sleep(200)
          }
          return originalEntry.apply(this, args)
        }

        secondEngine = new MostBoxEngine({ dataPath })
        await secondEngine.start()
        const listed = secondEngine
          .listPublishedFiles()
          .find(file => file.cid === published.cid)

        assert.ok(listed)
        assert.strictEqual(listed.seedStatus, 'queued')
        assert.strictEqual(listed.localAvailable, false)
      } finally {
        Hyperdrive.prototype.entry = originalEntry
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(queuedTmpDir, { recursive: true, force: true })
      }
    })

    it('checks remote availability before pulling an imported metadata-only file', async () => {
      const cacheTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-cache-check-')
      )
      const sourcePath = path.join(cacheTmpDir, 'source')
      const targetPath = path.join(cacheTmpDir, 'target')
      const cacheOwner = '0x3535353535353535353535353535353535353535'
      let sourceEngine
      let targetEngine

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

        const published = await sourceEngine.publishFile(
          Buffer.from('cache check content'),
          'cache-check.txt',
          { ownerAddress: cacheOwner }
        )
        await targetEngine.importUserData(
          cacheOwner,
          sourceEngine.exportUserData(cacheOwner)
        )

        let checked = false
        let pulled = false
        targetEngine.checkDownloadAvailability = async link => {
          checked = true
          assert.match(link, new RegExp(`^most://${published.cid}`))
          throw new Error('checked first')
        }
        targetEngine.pullByCid = async () => {
          pulled = true
          return { success: true }
        }

        await assert.rejects(
          targetEngine.cacheFile(published.cid, {
            ownerAddress: cacheOwner,
            timeout: 123,
          }),
          /checked first/
        )
        assert.strictEqual(checked, true)
        assert.strictEqual(pulled, false)
      } finally {
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (targetEngine) await targetEngine.stop().catch(() => {})
        fs.rmSync(cacheTmpDir, { recursive: true, force: true })
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

    it('imports account file metadata without pulling file content automatically', async () => {
      const syncTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-user-import-')
      )
      const sourcePath = path.join(syncTmpDir, 'source')
      const targetPath = path.join(syncTmpDir, 'target')
      const syncOwner = '0x3333333333333333333333333333333333333333'
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

        const published = await sourceEngine.publishFile(
          Buffer.from('imported directory only'),
          'imported-dir.txt',
          { ownerAddress: syncOwner }
        )
        const backup = sourceEngine.exportUserData(syncOwner)
        const importResult = await targetEngine.importUserData(
          syncOwner,
          backup
        )
        assert.strictEqual(importResult.filesAdded, 1)

        const imported = targetEngine
          .listPublishedFiles({ ownerAddress: syncOwner })
          .find(file => file.cid === published.cid)
        assert.ok(imported)
        assert.strictEqual(imported.fileName, 'imported-dir.txt')
        assert.strictEqual(imported.localAvailable, false)
        assert.ok(
          !targetEngine.listHoldings().some(item => item.cid === published.cid)
        )

        replication = sourceEngine.replicateWith(targetEngine)
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

    it('imports account profile metadata without overwriting newer local profile', async () => {
      const syncTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-user-profile-import-')
      )
      const sourcePath = path.join(syncTmpDir, 'source')
      const targetPath = path.join(syncTmpDir, 'target')
      const syncOwner = '0x3434343434343434343434343434343434343434'
      let sourceEngine
      let targetEngine

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

        sourceEngine.saveUserProfile(syncOwner, {
          displayName: 'Backup Name',
          avatar: 'old.png',
          updatedAt: 1000,
        })
        await targetEngine.importUserData(
          syncOwner,
          sourceEngine.exportUserData(syncOwner)
        )

        assert.strictEqual(
          targetEngine.getUserProfile(syncOwner).displayName,
          'Backup Name'
        )
        assert.strictEqual(
          targetEngine.getUserProfile(syncOwner).avatar,
          'old.png'
        )

        sourceEngine.saveUserProfile(syncOwner, {
          displayName: 'Fresh Name',
          avatar: '/avatars/default/panda.svg',
          updatedAt: 2000,
        })
        await targetEngine.importUserData(
          syncOwner,
          sourceEngine.exportUserData(syncOwner)
        )
        const freshProfile = targetEngine.getUserProfile(syncOwner)
        assert.strictEqual(freshProfile.displayName, 'Fresh Name')
        assert.strictEqual(freshProfile.avatar, '/avatars/default/panda.svg')

        targetEngine.saveUserProfile(syncOwner, {
          displayName: 'Newest Local',
          avatar: 'newest.png',
          updatedAt: 3000,
        })
        sourceEngine.saveUserProfile(syncOwner, {
          displayName: 'Stale Remote',
          avatar: 'stale.png',
          updatedAt: 2500,
        })
        await targetEngine.importUserData(
          syncOwner,
          sourceEngine.exportUserData(syncOwner)
        )
        assert.strictEqual(
          targetEngine.getUserProfile(syncOwner).displayName,
          'Newest Local'
        )
        assert.strictEqual(
          targetEngine.getUserProfile(syncOwner).avatar,
          'newest.png'
        )
      } finally {
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (targetEngine) await targetEngine.stop().catch(() => {})
        fs.rmSync(syncTmpDir, { recursive: true, force: true })
      }
    })

    it('imports channel metadata and opens the channel runtime', async () => {
      const syncTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-user-import-channel-')
      )
      const sourcePath = path.join(syncTmpDir, 'source')
      const targetPath = path.join(syncTmpDir, 'target')
      const syncOwner = '0x4444444444444444444444444444444444444444'
      const channelName = `sync-${uid}`
      let sourceEngine
      let targetEngine

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

        const created = await sourceEngine.createChannel(
          channelName,
          'personal',
          {
            ownerAddress: syncOwner,
            displayName: 'Sync Owner',
          }
        )
        sourceEngine.setChannelRemark(created.channelKey, '同步频道', {
          ownerAddress: syncOwner,
        })
        const importResult = await targetEngine.importUserData(
          syncOwner,
          sourceEngine.exportUserData(syncOwner)
        )
        assert.strictEqual(importResult.channelsAdded, 1)

        const syncedChannel = targetEngine
          .listChannels({ ownerAddress: syncOwner })
          .find(channel => channel.channelKey === created.channelKey)
        assert.ok(syncedChannel)
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

    it('filters dotted system channels by default', async () => {
      const chatName = `list-chat-${uid}`
      const gameName = `game.gandengyan.${uid}`
      await engine.createChannel(chatName, 'public')
      await engine.createChannel(gameName, GAME_CHANNEL_TYPE)

      const channels = engine.listChannels()
      assert.ok(channels.some(c => c.name === chatName))
      assert.ok(!channels.some(c => c.name === gameName))
      assert.ok(
        channels.every(
          c =>
            ![c.name, c.channelId, c.channelKey].some(value =>
              String(value || '').includes('.')
            )
        )
      )

      const gameChannels = engine.listChannels({ type: GAME_CHANNEL_TYPE })
      assert.ok(gameChannels.some(c => c.name === gameName))
    })
  })

  describe('channel welcome messages', () => {
    it('writes a system member-joined message with the joining profile snapshot', async () => {
      const ownerAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const channelName = `welcome-${uid}`
      await engine.createChannel(channelName, 'public', {
        ownerAddress,
        displayName: 'Alice#5678',
        identity: 'service_ai',
        avatar: 'data:image/png;base64,alice',
      })

      const messages = await engine.getChannelMessages(channelName, {
        ownerAddress,
      })

      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0].type, 'system')
      assert.strictEqual(messages[0].event, 'channel.member.joined')
      assert.strictEqual(messages[0].content, 'channel.member.joined')
      assert.strictEqual(messages[0].author, ownerAddress)
      assert.strictEqual(messages[0].authorName, 'Alice#5678')
      assert.strictEqual(messages[0].authorIdentity, 'service_ai')
      assert.strictEqual(messages[0].avatar, 'data:image/png;base64,alice')
    })

    it('does not repeat the welcome message for an existing member', async () => {
      const alice = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const channelName = `welcome-once-${uid}`
      await engine.createChannel(channelName, 'public', {
        ownerAddress: alice,
        displayName: 'Alice',
      })
      await engine.createChannel(channelName, 'public', {
        ownerAddress: alice,
        displayName: 'Alice Fresh',
        avatar: 'alice.png',
      })
      await engine.joinChannel(channelName, null, {
        ownerAddress: alice,
        displayName: 'Alice Again',
      })

      const messages = await engine.getChannelMessages(channelName, {
        ownerAddress: alice,
      })
      const welcomeMessages = messages.filter(
        message => message.event === 'channel.member.joined'
      )

      assert.strictEqual(welcomeMessages.length, 1)
      assert.strictEqual(welcomeMessages[0].type, 'system')
      assert.strictEqual(welcomeMessages[0].authorName, 'Alice')
    })

    it('does not write chat welcome messages for game channels', async () => {
      const ownerAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const channelName = gameRoomCodeToChannelName('gandengyan', `G${uid}`)
      await engine.createChannel(channelName, GAME_CHANNEL_TYPE, {
        ownerAddress,
        displayName: 'Game User',
        avatar: 'game.png',
      })

      const messages = await engine.getChannelMessages(channelName, {
        ownerAddress,
      })

      assert.deepStrictEqual(messages, [])
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

    it('persists message author profile snapshots', async () => {
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
      const message = messages.find(item => item.content === 'Hello Avatar')
      assert.strictEqual(message.authorName, 'Avatar Sender')
      assert.strictEqual(message.avatar, 'data:image/png;base64,msg-avatar')

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Fresh Sender',
        avatar: '/avatars/default/mint.svg',
      })
      const refreshed = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      const refreshedMessage = refreshed.find(
        item => item.content === 'Hello Avatar'
      )
      assert.strictEqual(refreshedMessage.authorName, 'Avatar Sender')
      assert.strictEqual(
        refreshedMessage.avatar,
        'data:image/png;base64,msg-avatar'
      )

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'No Avatar Sender',
        avatar: '',
      })
      const cleared = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      const clearedMessage = cleared.find(
        item => item.content === 'Hello Avatar'
      )
      assert.strictEqual(clearedMessage.authorName, 'Avatar Sender')
      assert.strictEqual(
        clearedMessage.avatar,
        'data:image/png;base64,msg-avatar'
      )
    })

    it('persists message identity, client id and structured mentions', async () => {
      const ch = `mention-msg-${uid}`
      const author = '0x1234567890abcdef1234567890abcdef12345678'
      const mentioned = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      const clientMessageId = '11111111-1111-4111-8111-111111111111'
      const content = 'hello @Visitor'
      const mentions = [
        {
          address: mentioned,
          label: 'Visitor',
          start: 6,
          end: 14,
        },
      ]

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Service',
        identity: 'service_ai',
      })

      const msg = await msgEngine.sendMessage(
        ch,
        content,
        author,
        'Service',
        {
          ownerAddress: author,
          authorIdentity: 'service_ai',
          clientMessageId,
          mentions,
        }
      )

      assert.strictEqual(msg.authorIdentity, 'service_ai')
      assert.strictEqual(msg.clientMessageId, clientMessageId)
      assert.deepStrictEqual(msg.mentions, [
        {
          ...mentions[0],
          address: mentioned.toLowerCase(),
        },
      ])

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Service',
        identity: 'service',
      })

      const messages = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      const saved = messages.find(item => item.content === content)
      assert.strictEqual(saved.authorIdentity, 'service_ai')
      assert.strictEqual(saved.clientMessageId, clientMessageId)
      assert.deepStrictEqual(saved.mentions, msg.mentions)
    })

    it('uses channel member identity when a message omits author identity', async () => {
      const ch = `member-identity-msg-${uid}`
      const author = '0x1234567890abcdef1234567890abcdef12345678'
      const content = 'member identity fallback'

      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Service',
        identity: 'service_ai',
      })

      const msg = await msgEngine.sendMessage(ch, content, author, 'Service', {
        ownerAddress: author,
      })

      assert.strictEqual(msg.authorIdentity, 'service_ai')

      const messages = await msgEngine.getChannelMessages(ch, {
        ownerAddress: author,
      })
      const saved = messages.find(item => item.content === content)
      assert.strictEqual(saved.authorIdentity, 'service_ai')
    })

    it('rejects invalid strict mention and client message fields', async () => {
      const ch = `bad-mention-${uid}`
      const author = '0x1234567890abcdef1234567890abcdef12345678'
      const cid =
        'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
      const fileName = `chat-file/${ch}/photo.png`
      const link = `most://${cid}?filename=${encodeURIComponent(fileName)}`
      await msgEngine.createChannel(ch, 'personal', {
        ownerAddress: author,
        displayName: 'Service',
      })

      await assert.rejects(
        msgEngine.sendMessage(ch, 'hello', author, 'Service', {
          ownerAddress: author,
          clientMessageId: 'not-a-uuid',
        }),
        /Invalid clientMessageId/
      )
      await assert.rejects(
        msgEngine.sendMessage(ch, 'hello @Visitor', author, 'Service', {
          ownerAddress: author,
          mentions: 'bad',
        }),
        /mentions must be an array/
      )
      await assert.rejects(
        msgEngine.sendMessage(ch, 'hello @Visitor', author, 'Service', {
          ownerAddress: author,
          mentions: [
            {
              address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
              label: 'Visitor',
              start: 0,
              end: 8,
            },
          ],
        }),
        /Invalid mention/
      )
      await assert.rejects(
        msgEngine.sendMessage(ch, link, author, 'Service', {
          ownerAddress: author,
          attachment: {
            kind: 'image',
            cid,
            fileName,
            link,
          },
          mentions: [
            {
              address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
              label: 'Visitor',
              start: 0,
              end: 8,
            },
          ],
        }),
        /attachment messages cannot include mentions/
      )
    })

    it('profile sync does not rewrite saved chat and game message snapshots', async () => {
      const author = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      const roomCode = 'ABCD'
      const chatChannel = `profile-chat-${uid}`
      const gameChannel = gameRoomCodeToChannelName('gandengyan', roomCode)
      const oldProfile = {
        ownerAddress: author,
        displayName: 'Old Profile',
        avatar: 'old.png',
      }
      const freshProfile = {
        ownerAddress: author,
        displayName: 'Fresh Profile',
        avatar: '/avatars/default/panda.svg',
        syncUpdatedAt: 2000,
      }

      await msgEngine.createChannel(chatChannel, 'public', oldProfile)
      await msgEngine.sendMessage(
        chatChannel,
        'hello profile',
        author,
        oldProfile.displayName,
        oldProfile
      )

      await msgEngine.createChannel(gameChannel, GAME_CHANNEL_TYPE, oldProfile)
      const joinEvent = createGameEvent({
        gameId: 'gandengyan',
        roomCode,
        event: 'player:join',
        payload: {
          player: {
            address: author,
            name: oldProfile.displayName,
            avatar: oldProfile.avatar,
          },
        },
      })
      await msgEngine.sendMessage(
        gameChannel,
        JSON.stringify(joinEvent),
        author,
        oldProfile.displayName,
        oldProfile
      )

      msgEngine.saveUserProfile(author, freshProfile)

      const chatMessages = await msgEngine.getChannelMessages(chatChannel, {
        ownerAddress: author,
      })
      const chatMessage = chatMessages.find(
        message => message.content === 'hello profile'
      )
      assert.strictEqual(chatMessage.authorName, oldProfile.displayName)
      assert.strictEqual(chatMessage.avatar, oldProfile.avatar)

      const gameMessages = await msgEngine.getChannelMessages(gameChannel, {
        ownerAddress: author,
      })
      const gameMessage = gameMessages.find(
        message => message.content === JSON.stringify(joinEvent)
      )
      assert.strictEqual(gameMessage.authorName, oldProfile.displayName)
      assert.strictEqual(gameMessage.avatar, oldProfile.avatar)

      const lobby = deriveGameRoomLobby(gameMessages, {
        gameId: 'gandengyan',
        roomCode,
      })
      assert.strictEqual(lobby.players[0].name, oldProfile.displayName)
      assert.strictEqual(lobby.players[0].avatar, oldProfile.avatar)
    })

    it('stores channel attachment metadata', async () => {
      const ch = `attach-${uid}`
      const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
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

    it('keeps bare chat attachment filenames unchanged', async () => {
      const ch = `old-attach-${uid}`
      const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
      const fileName = '#18.txt'
      const link = `most://${cid}?filename=${encodeURIComponent(fileName)}`
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
      assert.strictEqual(messages[0].attachment.fileName, fileName)
      assert.strictEqual(messages[0].attachment.link, link)
      assert.strictEqual(messages[0].content, link)
    })

    it('does not double-prefix normalized chat attachment filenames', async () => {
      const ch = `norm-attach-${uid}`
      const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
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

    it('reopens the local writer core when append sees a closed session', async () => {
      const ch = `closed-session-${uid}`
      const content = 'message after closed session'
      await msgEngine.createChannel(ch)

      const originalAppend = Hypercore.prototype.append
      let injected = false
      Hypercore.prototype.append = async function appendWithClosedSession(
        blocks,
        opts
      ) {
        const entries = Array.isArray(blocks) ? blocks : [blocks]
        if (
          !injected &&
          entries.some(entry => entry && entry.content === content)
        ) {
          injected = true
          throw HypercoreError.SESSION_CLOSED(
            'Cannot append to a closed session',
            this.discoveryKey
          )
        }
        return originalAppend.call(this, blocks, opts)
      }

      try {
        const message = await msgEngine.sendMessage(ch, content)
        const messages = await msgEngine.getChannelMessages(ch)

        assert.strictEqual(injected, true)
        assert.strictEqual(message.content, content)
        assert.ok(messages.some(item => item.content === content))
      } finally {
        Hypercore.prototype.append = originalAppend
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

        await withMockedDateNow(1000, () => firstEngine.sendMessage(ch, 'A1'))
        await waitForChannelMessage(secondEngine, ch, 'A1')

        await withMockedDateNow(10000, () => secondEngine.sendMessage(ch, 'B1'))
        await waitForChannelMessage(firstEngine, ch, 'B1')

        await withMockedDateNow(2000, () => firstEngine.sendMessage(ch, 'A2'))
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

    it('includes remote peer member profiles from channel hello', async () => {
      const peerTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-peer-test-')
      )
      const firstDataPath = path.join(peerTmpDir, 'first')
      const secondDataPath = path.join(peerTmpDir, 'second')
      const channelName = `peers-remote-${uid}`
      const alice = `0x${'1'.repeat(40)}`
      const bob = `0x${'2'.repeat(40)}`
      let firstEngine
      let secondEngine
      let replication

      try {
        fs.mkdirSync(firstDataPath, { recursive: true })
        fs.mkdirSync(secondDataPath, { recursive: true })
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

        await firstEngine.createChannel(channelName, 'public', {
          ownerAddress: alice,
          displayName: 'Alice',
          identity: 'alice_label',
          avatar: 'alice.png',
        })
        await secondEngine.createChannel(channelName, 'public', {
          ownerAddress: bob,
          displayName: 'Bob',
          identity: 'bob_label',
          avatar: 'bob.png',
        })

        replication = firstEngine.replicateWith(secondEngine)
        const remotePeer = await waitForChannelPeerAddress(
          firstEngine,
          channelName,
          bob,
          { ownerAddress: alice }
        )

        assert.notStrictEqual(remotePeer.peerId, firstEngine.getNodeId())
        const bobMember = await waitForChannelMember(
          firstEngine,
          channelName,
          bob,
          { ownerAddress: alice }
        )
        assert.strictEqual(bobMember.displayName, 'Bob')
        assert.strictEqual(bobMember.identity, 'bob_label')
        assert.strictEqual(bobMember.avatar, 'bob.png')

        const aliceMember = await waitForChannelMember(
          secondEngine,
          channelName,
          alice,
          { ownerAddress: bob }
        )
        assert.strictEqual(aliceMember.displayName, 'Alice')
        assert.strictEqual(aliceMember.identity, 'alice_label')
        assert.strictEqual(aliceMember.avatar, 'alice.png')
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(peerTmpDir, { recursive: true, force: true })
      }
    })

    it('scopes channel hello member profiles to the connected channel', async () => {
      const peerTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-scope-test-')
      )
      const firstDataPath = path.join(peerTmpDir, 'first')
      const secondDataPath = path.join(peerTmpDir, 'second')
      const sharedChannelName = `peers-scope-shared-${uid}`
      const isolatedChannelName = `peers-scope-isolated-${uid}`
      const alice = `0x${'1'.repeat(40)}`
      const bob = `0x${'2'.repeat(40)}`
      const carol = `0x${'3'.repeat(40)}`
      const dave = `0x${'4'.repeat(40)}`
      let firstEngine
      let secondEngine
      let replication

      try {
        fs.mkdirSync(firstDataPath, { recursive: true })
        fs.mkdirSync(secondDataPath, { recursive: true })
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

        await firstEngine.createChannel(sharedChannelName, 'public', {
          ownerAddress: alice,
          displayName: 'Alice',
          identity: 'alice_label',
        })
        await secondEngine.createChannel(sharedChannelName, 'public', {
          ownerAddress: bob,
          displayName: 'Bob',
          identity: 'bob_label',
        })
        await firstEngine.createChannel(isolatedChannelName, 'public', {
          ownerAddress: carol,
          displayName: 'Carol',
          identity: 'carol_label',
        })
        await secondEngine.createChannel(isolatedChannelName, 'public', {
          ownerAddress: dave,
          displayName: 'Dave',
          identity: 'dave_label',
        })

        replication = firstEngine.replicateWith(secondEngine, {
          channelNames: [sharedChannelName],
        })

        const bobMember = await waitForChannelMember(
          firstEngine,
          sharedChannelName,
          bob,
          { ownerAddress: alice }
        )
        const aliceMember = await waitForChannelMember(
          secondEngine,
          sharedChannelName,
          alice,
          { ownerAddress: bob }
        )
        assert.strictEqual(bobMember.identity, 'bob_label')
        assert.strictEqual(aliceMember.identity, 'alice_label')

        await sleep(100)
        const firstIsolated = firstEngine
          .listChannels({ ownerAddress: carol })
          .find(channel => channel.name === isolatedChannelName)
        const secondIsolated = secondEngine
          .listChannels({ ownerAddress: dave })
          .find(channel => channel.name === isolatedChannelName)
        assert.ok(
          !firstIsolated.members.some(
            member => member.address === dave.toLowerCase()
          )
        )
        assert.ok(
          !secondIsolated.members.some(
            member => member.address === carol.toLowerCase()
          )
        )

        firstEngine.joinChannelPresence(isolatedChannelName, {
          ownerAddress: carol,
          sessionId: 'carol-isolated',
          displayName: 'Carol Live',
          identity: 'carol_live',
        })
        await sleep(100)
        const leakedPresence = secondEngine
          .getChannelPresence(isolatedChannelName, { ownerAddress: dave })
          .find(entry => entry.address === carol.toLowerCase())
        assert.strictEqual(leakedPresence, undefined)
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(peerTmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('channel presence', () => {
    it('emits transient voice events without storing them in channel history', async () => {
      const channelName = `voice-${uid}`
      const alice = `0x${'e'.repeat(40)}`
      const events = []
      const onVoice = event => {
        if (event.channelKey === channelName) events.push(event)
      }

      engine.on('channel:voice', onVoice)
      try {
        await engine.createChannel(channelName, 'personal', {
          ownerAddress: alice,
          displayName: 'Alice',
        })
        const messagesBefore = await engine.getChannelMessages(channelName, {
          ownerAddress: alice,
        })

        const result = engine.sendChannelVoiceEvent(
          channelName,
          {
            event: 'join',
            sessionId: 'voice-alice',
            micMuted: false,
            displayName: 'Alice',
            avatar: '/avatars/default/mint.svg',
          },
          {
            ownerAddress: alice,
          }
        )

        assert.strictEqual(result.event, 'join')
        assert.strictEqual(result.sender.address, alice)
        assert.strictEqual(result.sender.displayName, 'Alice')
        assert.strictEqual(result.micMuted, false)
        assert.strictEqual(events.length, 1)
        assert.strictEqual(events[0].sessionId, 'voice-alice')

        const messages = await engine.getChannelMessages(channelName, {
          ownerAddress: alice,
        })
        assert.strictEqual(messages.length, messagesBefore.length)
        assert.ok(!messages.some(message => message.type === 'channel-voice'))
      } finally {
        engine.off('channel:voice', onVoice)
      }
    })

    it('tracks local sessions and keeps profile separate from heartbeat', async () => {
      const channelName = `presence-local-${uid}`
      const alice = `0x${'c'.repeat(40)}`
      const events = []
      const onPresence = event => {
        if (event.channelKey === channelName) events.push(event)
      }

      engine.on('channel:presence', onPresence)
      try {
        await engine.createChannel(channelName, 'personal', {
          ownerAddress: alice,
          displayName: 'Alice old',
        })
        const now = Date.now()

        await withMockedDateNow(now, async () => {
          engine.joinChannelPresence(channelName, {
            ownerAddress: alice,
            sessionId: 'one',
            displayName: 'Alice',
            identity: 'service',
            avatar: 'https://example.test/a.png',
            profileUpdatedAt: 1,
          })
        })
        await withMockedDateNow(now + 1000, async () => {
          engine.heartbeatChannelPresence(channelName, {
            ownerAddress: alice,
            sessionId: 'one',
          })
        })

        let presence = engine.getChannelPresence(channelName, {
          ownerAddress: alice,
        })
        assert.strictEqual(presence.length, 1)
        assert.strictEqual(presence[0].address, alice)
        assert.strictEqual(presence[0].displayName, 'Alice')
        assert.strictEqual(presence[0].identity, 'service')
        assert.strictEqual(presence[0].avatar, 'https://example.test/a.png')
        assert.strictEqual(presence[0].lastSeen, now + 1000)

        engine.joinChannelPresence(channelName, {
          ownerAddress: alice,
          sessionId: 'two',
          displayName: 'Alice new',
          identity: 'service_ai',
          avatar: 'https://example.test/new.png',
          profileUpdatedAt: 2,
        })
        engine.leaveChannelPresence(channelName, {
          ownerAddress: alice,
          sessionId: 'one',
        })
        presence = engine.getChannelPresence(channelName, {
          ownerAddress: alice,
        })
        assert.strictEqual(presence.length, 1)
        assert.strictEqual(presence[0].displayName, 'Alice new')
        assert.strictEqual(presence[0].identity, 'service_ai')
        assert.strictEqual(presence[0].online, true)

        engine.leaveChannelPresence(channelName, {
          ownerAddress: alice,
          sessionId: 'two',
        })
        presence = engine.getChannelPresence(channelName, {
          ownerAddress: alice,
        })
        assert.strictEqual(presence.length, 0)
        assert.ok(events.some(event => event.status === 'online'))
        assert.ok(events.some(event => event.status === 'profile'))
        assert.ok(events.some(event => event.status === 'offline'))
      } finally {
        engine.off('channel:presence', onPresence)
      }
    })

    it('accepts presence identity without a profile timestamp', async () => {
      const channelName = `presence-identity-no-ts-${uid}`
      const service = `0x${'e'.repeat(40)}`
      const now = Date.now()

      await engine.createChannel(channelName, 'personal', {
        ownerAddress: service,
        displayName: 'SparkBit AI Support',
      })

      await withMockedDateNow(now, async () => {
        engine.joinChannelPresence(channelName, {
          ownerAddress: service,
          sessionId: 'service-ai',
          displayName: 'SparkBit AI Support',
          identity: 'service_ai',
          avatar: 'https://example.test/service.png',
        })
      })

      const presence = engine.getChannelPresence(channelName, {
        ownerAddress: service,
      })
      assert.strictEqual(presence.length, 1)
      assert.strictEqual(presence[0].displayName, 'SparkBit AI Support')
      assert.strictEqual(presence[0].identity, 'service_ai')
      assert.strictEqual(presence[0].avatar, 'https://example.test/service.png')
      assert.strictEqual(presence[0].profileUpdatedAt, now)
    })

    it('expires stale sessions after the presence timeout', async () => {
      const channelName = `presence-timeout-${uid}`
      const alice = `0x${'d'.repeat(40)}`
      await engine.createChannel(channelName, 'personal', {
        ownerAddress: alice,
        displayName: 'Alice',
      })

      await withMockedDateNow(1000, async () => {
        engine.joinChannelPresence(channelName, {
          ownerAddress: alice,
          sessionId: 'stale',
          displayName: 'Alice',
        })
      })
      await withMockedDateNow(1000 + 45 * 1000 + 1, async () => {
        engine.pruneChannelPresence()
      })

      const presence = engine.getChannelPresence(channelName, {
        ownerAddress: alice,
      })
      assert.strictEqual(presence.length, 0)
    })

    it('replicates presence over channel peer streams', async () => {
      const presenceTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-presence-test-')
      )
      const firstDataPath = path.join(presenceTmpDir, 'first')
      const secondDataPath = path.join(presenceTmpDir, 'second')
      const channelName = `presence-remote-${uid}`
      const alice = `0x${'3'.repeat(40)}`
      const bob = `0x${'4'.repeat(40)}`
      let firstEngine
      let secondEngine
      let replication

      try {
        fs.mkdirSync(firstDataPath, { recursive: true })
        fs.mkdirSync(secondDataPath, { recursive: true })
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

        await firstEngine.createChannel(channelName, 'public', {
          ownerAddress: alice,
          displayName: 'Alice',
        })
        await secondEngine.createChannel(channelName, 'public', {
          ownerAddress: bob,
          displayName: 'Bob',
        })

        replication = firstEngine.replicateWith(secondEngine)
        await sleep(25)
        firstEngine.joinChannelPresence(channelName, {
          ownerAddress: alice,
          sessionId: 'alice-tab',
          displayName: 'Alice Live',
          identity: 'service_ai',
          avatar: 'https://example.test/alice.png',
          profileUpdatedAt: 3,
        })

        const remotePresence = await waitForChannelPresenceAddress(
          secondEngine,
          channelName,
          alice,
          { ownerAddress: bob }
        )
        assert.strictEqual(remotePresence.displayName, 'Alice Live')
        assert.strictEqual(remotePresence.identity, 'service_ai')
        assert.strictEqual(
          remotePresence.avatar,
          'https://example.test/alice.png'
        )

        firstEngine.leaveChannelPresence(channelName, {
          ownerAddress: alice,
          sessionId: 'alice-tab',
        })
        const start = Date.now()
        while (Date.now() - start < 5000) {
          const presence = secondEngine.getChannelPresence(channelName, {
            ownerAddress: bob,
          })
          if (!presence.some(item => item.address === alice)) return
          await sleep(25)
        }
        throw new Error('Remote presence did not go offline')
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(presenceTmpDir, { recursive: true, force: true })
      }
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

      const pinned = engine.setChannelPinned(channelName, true, {
        ownerAddress,
      })

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

      const unpinned = engine.setChannelPinned(channelName, false, {
        ownerAddress,
      })
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

    it('announces sync availability when an empty local channel later learns remote cores', async () => {
      const syncTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-sync-available-test-')
      )
      const sourceDataPath = path.join(syncTmpDir, 'source')
      const emptyDataPath = path.join(syncTmpDir, 'empty')
      const channelName = `sync-${uid}`
      let sourceEngine
      let emptyEngine
      let replication

      try {
        sourceEngine = new MostBoxEngine({
          dataPath: sourceDataPath,
          disableNetwork: true,
        })
        emptyEngine = new MostBoxEngine({
          dataPath: emptyDataPath,
          disableNetwork: true,
        })
        await sourceEngine.start()
        await emptyEngine.start()

        const sourceChannel = await sourceEngine.createChannel(channelName)
        await sourceEngine.sendMessage(sourceChannel.channelKey, 'before sync')
        const emptyChannel = await emptyEngine.joinChannel(channelName)
        const initialMessages =
          await emptyEngine.getChannelMessages(channelName)
        assert.ok(
          !initialMessages.some(message => message.content === 'before sync')
        )

        const syncEvents = []
        emptyEngine.on('channel:sync:available', event => {
          syncEvents.push(event)
        })
        await emptyEngine.joinChannel(
          channelName,
          toChannelCandidate(sourceChannel)
        )

        assert.strictEqual(syncEvents.length, 1)
        assert.strictEqual(syncEvents[0].channelKey, emptyChannel.channelKey)
        assert.strictEqual(syncEvents[0].channelId, channelName)
        assert.strictEqual(
          syncEvents[0].writerCoreKey,
          sourceChannel.localWriterCoreKey
        )

        replication = sourceEngine.replicateWith(emptyEngine)
        await waitForChannelMessage(emptyEngine, channelName, 'before sync')
      } finally {
        replication?.close()
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (emptyEngine) await emptyEngine.stop().catch(() => {})
        fs.rmSync(syncTmpDir, { recursive: true, force: true })
      }
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

    it('discovers channel candidates from a scoped channel ID connection', async () => {
      const joinTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-id-scope-test-')
      )
      const sourceDataPath = path.join(joinTmpDir, 'source')
      const joinDataPath = path.join(joinTmpDir, 'join')
      const channelName = `id-scope-join-${uid}`
      const alice = `0x${'5'.repeat(40)}`
      const bob = `0x${'6'.repeat(40)}`
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

        const sourceChannel = await sourceEngine.createChannel(
          channelName,
          'public',
          {
            ownerAddress: alice,
            displayName: 'Alice',
            identity: 'alice_label',
          }
        )

        replication = sourceEngine.replicateWith(joinEngine, {
          leftChannelNames: [],
          rightChannelNames: [],
          rightChannelIds: [channelName],
        })
        await sleep(100)

        const joined = await joinEngine.createChannel(channelName, 'public', {
          ownerAddress: bob,
          displayName: 'Bob',
          identity: 'bob_label',
          discover: true,
        })
        assert.ok(joined.writerCoreKeys.includes(sourceChannel.localWriterCoreKey))
        assert.strictEqual(
          joined.members.find(member => member.address === alice)?.identity,
          'alice_label'
        )
      } finally {
        replication?.close()
        if (sourceEngine) await sourceEngine.stop().catch(() => {})
        if (joinEngine) await joinEngine.stop().catch(() => {})
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
        await waitForChannelMessage(
          secondEngine,
          second.channelKey,
          'from first'
        )
        await waitForChannelMessage(
          firstEngine,
          first.channelKey,
          'from second'
        )

        const firstMessages = await firstEngine.getChannelMessages(
          first.channelKey
        )
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

    it('deduplicates the same member-joined system message from multiple writer cores', async () => {
      const joinTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-channel-join-dedupe-test-')
      )
      const firstDataPath = path.join(joinTmpDir, 'first')
      const secondDataPath = path.join(joinTmpDir, 'second')
      const channelName = `join-dedupe-${uid}`
      const visitor = `0x${'9'.repeat(40)}`
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

        const first = await firstEngine.createChannel(channelName, 'public', {
          ownerAddress: visitor,
          displayName: 'Visitor',
        })
        const second = await secondEngine.createChannel(channelName, 'public', {
          ownerAddress: visitor,
          displayName: 'Visitor',
        })
        await firstEngine.joinChannel(channelName, toChannelCandidate(second), {
          ownerAddress: visitor,
          displayName: 'Visitor',
        })
        await secondEngine.joinChannel(channelName, toChannelCandidate(first), {
          ownerAddress: visitor,
          displayName: 'Visitor',
        })

        replication = firstEngine.replicateWith(secondEngine)
        await sleep(50)

        const messages = await firstEngine.getChannelMessages(channelName, {
          ownerAddress: visitor,
        })
        const welcomeMessages = messages.filter(
          message => message.event === 'channel.member.joined'
        )

        assert.strictEqual(welcomeMessages.length, 1)
        assert.strictEqual(welcomeMessages[0].author, visitor)
        assert.strictEqual(welcomeMessages[0].authorName, 'Visitor')
      } finally {
        replication?.close()
        if (firstEngine) await firstEngine.stop().catch(() => {})
        if (secondEngine) await secondEngine.stop().catch(() => {})
        fs.rmSync(joinTmpDir, { recursive: true, force: true })
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
          const second = await secondEngine.createChannel(
            channelName,
            'public',
            {
              discover: true,
              discoveryTimeout: 25,
            }
          )

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
        await waitForChannelMessage(
          joinEngine,
          joined.channelKey,
          'from source'
        )
        await waitForChannelMessage(
          sourceEngine,
          created.channelKey,
          'from joiner'
        )

        const messages = await sourceEngine.getChannelMessages(
          created.channelKey
        )
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
