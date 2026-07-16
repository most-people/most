import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import Hyperdrive from 'hyperdrive'
import { CID } from 'multiformats/cid'
import {
  CHANNELS_FILE,
  DIAGNOSTIC_AUTHOR,
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
} from './channel-protocol.mjs'
import { openChannelControlProtocol } from './channel-control-protocol.mjs'
import { MobileP2PCore } from './mobile-core.mjs'

class RecordingSwarm extends EventEmitter {
  constructor(publicKeyByte) {
    super()
    this.connections = new Set()
    this.destroyed = false
    this.joins = []
    this.leaves = []
    this.keyPair = {
      publicKey: b4a.alloc(32, publicKeyByte),
    }
  }

  join(topic, options = {}) {
    const topicHex = b4a.toString(topic, 'hex')
    this.joins.push({
      topicHex,
      options: { ...options },
    })
    return {
      flushed: async () => {},
    }
  }

  async leave(topic) {
    this.leaves.push(b4a.toString(topic, 'hex'))
  }

  async destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

function createRecordingSwarmFactory(swarms) {
  return () => {
    const swarm = new RecordingSwarm(swarms.length + 1)
    swarms.push(swarm)
    return swarm
  }
}

function waitForTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

async function waitFor(condition, description, timeoutMs = 500) {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const value = condition()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

function connectChannelControl(swarm, streams = []) {
  const localStream = Hypercore.createProtocolStream(false)
  const remoteStream = Hypercore.createProtocolStream(true)
  const messages = []
  localStream.pipe(remoteStream).pipe(localStream)
  streams.push(localStream, remoteStream)
  const protocol = openChannelControlProtocol(remoteStream, {
    onMessage(message) {
      messages.push(message)
    },
  })
  swarm.emit('connection', localStream)
  return { localStream, remoteStream, protocol, messages }
}

function expectedChannelJoinTopics(channelId) {
  return [
    b4a.toString(generateChannelDiscoveryKey(channelId), 'hex'),
    b4a.toString(generateChannelChatDiscoveryKey(channelId), 'hex'),
    b4a.toString(generateChannelIdDiscoveryKey(channelId), 'hex'),
  ]
}

function assertJoinedChannelTopics(swarms, channelId) {
  const joinedTopics = new Set(
    swarms.flatMap(swarm => swarm.joins.map(join => join.topicHex))
  )

  for (const topicHex of expectedChannelJoinTopics(channelId)) {
    assert.equal(
      joinedTopics.has(topicHex),
      true,
      `expected channel discovery topic ${topicHex} to be joined`
    )
  }

  for (const swarm of swarms) {
    for (const join of swarm.joins) {
      assert.deepEqual(join.options, { server: true, client: true })
    }
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('mobile file downloads', () => {
  it('retains the peer snapshot key and version while seeding', async t => {
    const rootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-private-drive-')
    )
    const publisherSwarms = []
    const downloaderSwarms = []
    const verifierSwarms = []
    const publisher = new MobileP2PCore({
      storagePath: path.join(rootPath, 'publisher'),
      createSwarm: createRecordingSwarmFactory(publisherSwarms),
    })
    const downloader = new MobileP2PCore({
      storagePath: path.join(rootPath, 'downloader'),
      createSwarm: createRecordingSwarmFactory(downloaderSwarms),
    })
    const verifier = new MobileP2PCore({
      storagePath: path.join(rootPath, 'verifier'),
      createSwarm: createRecordingSwarmFactory(verifierSwarms),
    })
    const streams = []
    t.after(async () => {
      streams.forEach(stream => stream.destroy())
      await Promise.allSettled([
        publisher.stop(),
        downloader.stop(),
        verifier.stop(),
      ])
      await fs.rm(rootPath, { recursive: true, force: true })
    })

    await publisher.start()
    await downloader.start()
    const content = 'private mobile writer drive'
    const published = await publisher.publishFile({
      name: 'private.txt',
      contentBase64: b4a.toString(b4a.from(content), 'base64'),
    })
    const cid = published.transfer.cid
    const topic = b4a.from(CID.parse(cid).multihash.digest)
    const download = downloader.downloadLink({
      link: published.transfer.link,
      timeout: 5000,
    })
    await waitFor(
      () => downloaderSwarms[0].joins.length > 0,
      'downloader CID topic join'
    )

    const publisherStream = Hypercore.createProtocolStream(true)
    const downloaderStream = Hypercore.createProtocolStream(false)
    streams.push(publisherStream, downloaderStream)
    publisherStream.pipe(downloaderStream).pipe(publisherStream)
    const publisherInfo = new EventEmitter()
    publisherInfo.topics = [topic]
    const downloaderInfo = new EventEmitter()
    downloaderInfo.topics = [topic]
    publisherSwarms[0].emit('connection', publisherStream, publisherInfo)
    downloaderSwarms[0].emit('connection', downloaderStream, downloaderInfo)

    const result = await download
    assert.equal(await fs.readFile(result.savedPath, 'utf8'), content)
    const publicHolding = downloader.listHoldings()[0]
    assert.equal(publicHolding.cid, cid)
    assert.equal(Object.hasOwn(publicHolding, 'driveName'), false)
    assert.equal(Object.hasOwn(publicHolding, 'transport'), false)
    const publisherHolding = JSON.parse(
      await fs.readFile(
        path.join(rootPath, 'publisher', 'node-holdings.json'),
        'utf8'
      )
    ).holdings[0]
    const downloadedHolding = JSON.parse(
      await fs.readFile(
        path.join(rootPath, 'downloader', 'node-holdings.json'),
        'utf8'
      )
    ).holdings[0]
    assert.deepEqual(downloadedHolding.transport, publisherHolding.transport)

    await downloader.deleteHolding({ cid })
    const redownloaded = await downloader.downloadLink({
      link: published.transfer.link,
      timeout: 5000,
    })
    assert.equal(await fs.readFile(redownloaded.savedPath, 'utf8'), content)
    const redownloadedHolding = JSON.parse(
      await fs.readFile(
        path.join(rootPath, 'downloader', 'node-holdings.json'),
        'utf8'
      )
    ).holdings[0]
    assert.deepEqual(redownloadedHolding.transport, publisherHolding.transport)

    publisherStream.destroy()
    downloaderStream.destroy()
    await publisher.stop()
    await verifier.start()
    const relayedDownload = verifier.downloadLink({
      link: published.transfer.link,
      timeout: 5000,
    })
    await waitFor(
      () => verifierSwarms[0].joins.length > 0,
      'verifier CID topic join'
    )

    const relayStream = Hypercore.createProtocolStream(true)
    const verifierStream = Hypercore.createProtocolStream(false)
    streams.push(relayStream, verifierStream)
    relayStream.pipe(verifierStream).pipe(relayStream)
    const relayInfo = new EventEmitter()
    relayInfo.topics = [topic]
    const verifierInfo = new EventEmitter()
    verifierInfo.topics = [topic]
    downloaderSwarms[0].emit('connection', relayStream, relayInfo)
    verifierSwarms[0].emit('connection', verifierStream, verifierInfo)

    const relayed = await relayedDownload
    assert.equal(await fs.readFile(relayed.savedPath, 'utf8'), content)
    const verifierHolding = JSON.parse(
      await fs.readFile(
        path.join(rootPath, 'verifier', 'node-holdings.json'),
        'utf8'
      )
    ).holdings[0]
    assert.deepEqual(verifierHolding.transport, publisherHolding.transport)
  })

  it('refuses legacy storage without deleting it', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-storage-reset-')
    )
    const legacyMetadataPath = path.join(storagePath, 'node-holdings.json')
    await fs.writeFile(legacyMetadataPath, '[]')
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await assert.rejects(core.start(), error => {
      assert.equal(error.code, 'STORAGE_SCHEMA_RESET_REQUIRED')
      return true
    })
    assert.equal(await fs.readFile(legacyMetadataPath, 'utf8'), '[]')
  })

  it('refuses an unknown future storage schema', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-storage-future-')
    )
    await fs.writeFile(
      path.join(storagePath, 'storage-schema.json'),
      JSON.stringify({ version: 2 })
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await assert.rejects(core.start(), error => {
      assert.equal(error.code, 'STORAGE_SCHEMA_UNSUPPORTED')
      return true
    })
  })

  it('persists the private transport but only exposes the derived CID topic', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-private-holding-')
    )
    const firstCore = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await firstCore.stop()
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await firstCore.start()
    const published = await firstCore.publishFile({
      name: 'private-holding.txt',
      contentBase64: b4a.toString(b4a.from('private holding'), 'base64'),
    })
    const cid = published.transfer.cid
    const persisted = JSON.parse(
      await fs.readFile(path.join(storagePath, 'node-holdings.json'), 'utf8')
    )
    assert.equal(persisted.schemaVersion, 1)
    assert.match(persisted.holdings[0].transport.key, /^[a-f0-9]{64}$/)
    assert.ok(persisted.holdings[0].transport.version > 0)
    assert.equal(Object.hasOwn(persisted.holdings[0], 'topic'), false)
    assert.equal(Object.hasOwn(persisted.holdings[0], 'driveName'), false)
    await firstCore.stop()

    await core.start()

    const [holding] = core.listHoldings()
    assert.ok(holding)
    const expectedTopic = b4a.toString(CID.parse(cid).multihash.digest, 'hex')
    assert.equal(holding.topic, expectedTopic)
    assert.equal(Object.hasOwn(holding, 'driveName'), false)
    assert.equal(Object.hasOwn(holding, 'transport'), false)
  })

  it('recovers complete staging snapshots and removes incomplete ones', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-staging-')
    )
    const cores = []
    const createCore = () => {
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory([]),
      })
      cores.push(core)
      return core
    }
    t.after(async () => {
      await Promise.allSettled(cores.map(core => core.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const firstCore = createCore()
    await firstCore.start()
    const complete = await firstCore.publishFile({
      name: 'complete.txt',
      contentBase64: b4a.toString(b4a.from('complete staging'), 'base64'),
    })
    const incomplete = await firstCore.publishFile({
      name: 'incomplete.txt',
      contentBase64: b4a.toString(b4a.from('incomplete staging'), 'base64'),
    })
    await firstCore.stop()

    const metadataPath = path.join(storagePath, 'node-holdings.json')
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    for (const holding of metadata.holdings) {
      holding.state = 'staging'
      if (holding.cid === incomplete.transfer.cid) {
        holding.transport.version = 0
      }
    }
    await fs.writeFile(metadataPath, JSON.stringify(metadata))

    const recovered = createCore()
    await recovered.start()
    const holdings = recovered.listHoldings()
    assert.equal(
      holdings.some(holding => holding.cid === complete.transfer.cid),
      true
    )
    assert.equal(
      holdings.some(holding => holding.cid === incomplete.transfer.cid),
      false
    )
    const exported = await recovered.exportHolding({
      cid: complete.transfer.cid,
    })
    assert.equal(
      await fs.readFile(exported.filePath, 'utf8'),
      'complete staging'
    )
    await assert.rejects(
      recovered.exportHolding({ cid: incomplete.transfer.cid }),
      /not available in local holdings/
    )
  })

  it('recreates the downloads directory when exporting a retained snapshot', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-download-dir-')
    )
    const cores = []
    t.after(async () => {
      await Promise.allSettled(cores.map(core => core.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const createCore = swarms => {
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory(swarms),
      })
      cores.push(core)
      return core
    }

    const content = 'download me after restart'
    const firstCore = createCore([])
    await firstCore.start()
    const published = await firstCore.publishFile({
      name: 'chat-photo.jpg',
      contentBase64: b4a.toString(b4a.from(content), 'base64'),
    })
    const link = published.transfer.link
    const cid = published.transfer.cid
    await firstCore.stop()

    const restartedCore = createCore([])
    await restartedCore.start()
    await fs.rm(path.join(storagePath, 'downloads'), {
      recursive: true,
      force: true,
    })

    const result = await restartedCore.exportHolding({ cid })
    assert.equal(result.holding.cid, cid)
    assert.equal(await fs.readFile(result.filePath, 'utf8'), content)
    assert.equal(link.startsWith(`most://${cid}`), true)
  })
})

describe('mobile local holding deletion', () => {
  it('queues snapshot purge and reclaims it before the next swarm starts', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-delete-holding-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const cores = [core]
    const originalClearAll = Hyperdrive.prototype.clearAll
    let clearAllCalls = 0

    t.after(async () => {
      Hyperdrive.prototype.clearAll = originalClearAll
      await Promise.allSettled(cores.map(item => item.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const published = await core.publishFile({
      name: 'local-delete.txt',
      contentBase64: b4a.toString(b4a.from('local content'), 'base64'),
    })

    Hyperdrive.prototype.clearAll = async function (...args) {
      clearAllCalls += 1
      return originalClearAll.apply(this, args)
    }

    await core.deleteHolding({ cid: published.transfer.cid })

    assert.equal(clearAllCalls, 0)
    assert.equal(core.getSnapshot().holdings.length, 0)
    const pendingPath = path.join(storagePath, 'pending-drive-purges.json')
    const pending = JSON.parse(await fs.readFile(pendingPath, 'utf8'))
    assert.equal(pending.keys.length, 1)

    await core.stop()
    const restarted = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    cores.push(restarted)
    await restarted.start()
    assert.equal(clearAllCalls, 1)
    assert.equal(await fs.readFile(pendingPath, 'utf8').catch(() => ''), '')
    const republished = await restarted.publishFile({
      name: 'republished.txt',
      contentBase64: b4a.toString(b4a.from('local content'), 'base64'),
    })
    assert.equal(republished.transfer.cid, published.transfer.cid)
    const republishedTransport = JSON.parse(
      await fs.readFile(path.join(storagePath, 'node-holdings.json'), 'utf8')
    ).holdings[0].transport
    assert.notEqual(republishedTransport.key, pending.keys[0])
  })

  it('does not purge a snapshot key that is still referenced', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-retained-purge-')
    )
    const cores = []
    t.after(async () => {
      await Promise.allSettled(cores.map(item => item.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const first = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    cores.push(first)
    await first.start()
    const content = 'keep mobile referenced snapshot'
    const published = await first.publishFile({
      name: 'retained.txt',
      contentBase64: b4a.toString(b4a.from(content), 'base64'),
    })
    const metadataPath = path.join(storagePath, 'node-holdings.json')
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    const transport = metadata.holdings[0].transport
    await first.stop()

    const pendingPath = path.join(storagePath, 'pending-drive-purges.json')
    await fs.writeFile(
      pendingPath,
      JSON.stringify({ schemaVersion: 1, keys: [transport.key] })
    )

    const restarted = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    cores.push(restarted)
    await restarted.start()

    const exported = await restarted.exportHolding({
      cid: published.transfer.cid,
    })
    assert.equal(await fs.readFile(exported.filePath, 'utf8'), content)
    assert.equal(await fs.readFile(pendingPath, 'utf8').catch(() => ''), '')
  })

  it('rejects holdings that share a snapshot key across CIDs', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-duplicate-key-')
    )
    const cores = []
    t.after(async () => {
      await Promise.allSettled(cores.map(item => item.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const first = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    cores.push(first)
    await first.start()
    await first.publishFile({
      name: 'a.txt',
      contentBase64: b4a.toString(b4a.from('duplicate mobile A'), 'base64'),
    })
    await first.publishFile({
      name: 'b.txt',
      contentBase64: b4a.toString(b4a.from('duplicate mobile B'), 'base64'),
    })
    await first.stop()

    const metadataPath = path.join(storagePath, 'node-holdings.json')
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    metadata.holdings[1].transport = metadata.holdings[0].transport
    await fs.writeFile(metadataPath, JSON.stringify(metadata))

    const restarted = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    cores.push(restarted)
    await assert.rejects(
      restarted.start(),
      /Snapshot drive key must not be shared across holdings/
    )
  })
})

describe('mobile channel core restart recovery', () => {
  it('restores persisted channels, rejoins topics, keeps writer cores, and continues messaging', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-core-')
    )
    const cores = []
    t.after(async () => {
      await Promise.allSettled(cores.map(core => core.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const createCore = swarms => {
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory(swarms),
      })
      cores.push(core)
      return core
    }
    const channelId = 'android-restart'

    const firstSwarms = []
    const firstCore = createCore(firstSwarms)
    await firstCore.start()
    const created = await firstCore.createChannel({
      name: channelId,
      discover: false,
    })
    assertJoinedChannelTopics(firstSwarms, channelId)

    const writerCoreKey = created.localWriterCoreKey
    assert.match(writerCoreKey, /^[0-9a-f]{64}$/)
    assert.deepEqual(created.writerCoreKeys, [writerCoreKey])

    await firstCore.sendChannelMessage({
      channelName: channelId,
      authorName: 'Android',
      content: 'before restart',
    })
    assert.deepEqual(
      (await firstCore.getChannelMessages({ channelName: channelId })).map(
        message => message.content
      ),
      ['before restart']
    )

    const persistedChannels = JSON.parse(
      await fs.readFile(path.join(storagePath, CHANNELS_FILE), 'utf8')
    )
    assert.equal(persistedChannels.length, 1)
    assert.equal(persistedChannels[0].channelId, channelId)
    assert.equal(persistedChannels[0].localWriterCoreKey, writerCoreKey)
    assert.deepEqual(persistedChannels[0].writerCoreKeys, [writerCoreKey])

    await firstCore.stop()

    const restartedSwarms = []
    const restartedCore = createCore(restartedSwarms)
    await restartedCore.start()
    assertJoinedChannelTopics(restartedSwarms, channelId)

    const [restoredChannel] = restartedCore.listChannels()
    assert.equal(restoredChannel.channelId, channelId)
    assert.equal(restoredChannel.localWriterCoreKey, writerCoreKey)
    assert.deepEqual(restoredChannel.writerCoreKeys, [writerCoreKey])
    assert.deepEqual(
      (await restartedCore.getChannelMessages({ channelName: channelId })).map(
        message => message.content
      ),
      ['before restart']
    )

    await restartedCore.sendChannelMessage({
      channelName: channelId,
      authorName: 'Android',
      content: 'after restart',
    })
    assert.deepEqual(
      (await restartedCore.getChannelMessages({ channelName: channelId })).map(
        message => message.content
      ),
      ['before restart', 'after restart']
    )
  })
})

describe('mobile channel presence', () => {
  it('joins, heartbeats, leaves, and broadcasts Android presence', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-presence-')
    )
    const swarms = []
    const streams = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      streams.forEach(stream => stream.destroy())
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-presence',
      discover: false,
    })

    const chatSwarm = swarms[1]
    const connection = connectChannelControl(chatSwarm, streams)

    const joined = core.joinChannelPresence({
      channelName: channel.channelKey,
      sessionId: 'android-test',
      displayName: 'Android',
    })
    assert.equal(joined.length, 1)
    assert.equal(joined[0].address, DIAGNOSTIC_AUTHOR)
    assert.equal(joined[0].displayName, 'Android')
    assert.equal(joined[0].online, true)
    assert.equal(joined[0].local, true)

    core.heartbeatChannelPresence({
      channelName: channel.channelKey,
      sessionId: 'android-test',
    })
    core.leaveChannelPresence({
      channelName: channel.channelKey,
      sessionId: 'android-test',
    })

    const presenceWrites = await waitFor(() => {
      const messages = connection.messages.filter(
        message => message.type === 'channel-presence'
      )
      return messages.length === 3 ? messages : null
    }, 'channel presence control messages')
    assert.deepEqual(
      presenceWrites.map(message => message.status),
      ['online', 'heartbeat', 'offline']
    )
    assert.equal(
      core.getSnapshot().channelPresence[channel.channelKey]?.length || 0,
      0
    )
  })

  it('tracks remote presence, clears it on disconnect, and expires stale sessions', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-presence-')
    )
    const swarms = []
    const streams = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
      channelPresenceTimeoutMs: 100,
      channelPresenceSweepMs: 10,
    })
    t.after(async () => {
      streams.forEach(stream => stream.destroy())
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-presence-remote',
      discover: false,
    })

    const chatSwarm = swarms[1]
    const connection = connectChannelControl(chatSwarm, streams)
    connection.protocol.send({
      type: 'channel-presence',
      peerId: 'desktop-peer',
      channelId: channel.channelId,
      channelKey: channel.channelKey,
      address: '0x0000000000000000000000000000000000000002',
      displayName: 'Desktop',
      status: 'online',
      sessionId: 'web',
      lastSeen: Date.now(),
    })

    let presences = await waitFor(
      () =>
        core.getSnapshot().channelPresence[channel.channelKey]?.length === 1
          ? core.getSnapshot().channelPresence[channel.channelKey]
          : null,
      'remote channel presence'
    )
    assert.equal(presences.length, 1)
    assert.equal(presences[0].displayName, 'Desktop')
    assert.equal(presences[0].online, true)
    assert.equal(presences[0].local, false)

    connection.remoteStream.destroy()
    await waitFor(
      () =>
        (core.getSnapshot().channelPresence[channel.channelKey]?.length ||
          0) === 0,
      'remote channel presence disconnect'
    )

    const staleConnection = connectChannelControl(chatSwarm, streams)
    staleConnection.protocol.send({
      type: 'channel-presence',
      peerId: 'stale-peer',
      channelId: channel.channelId,
      channelKey: channel.channelKey,
      address: '0x0000000000000000000000000000000000000003',
      displayName: 'Stale',
      status: 'online',
      sessionId: 'web',
      lastSeen: Date.now(),
    })
    presences = await waitFor(
      () =>
        core.getSnapshot().channelPresence[channel.channelKey]?.length === 1
          ? core.getSnapshot().channelPresence[channel.channelKey]
          : null,
      'stale remote channel presence'
    )
    assert.equal(presences.length, 1)

    await waitFor(
      () =>
        (core.getSnapshot().channelPresence[channel.channelKey]?.length ||
          0) === 0,
      'stale remote channel presence expiry',
      500
    )
  })
})

describe('mobile channel metadata management', () => {
  it('sets remark, pins, leaves, and persists metadata across restart', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-channel-meta-')
    )
    const cores = []
    const streams = []
    t.after(async () => {
      streams.forEach(stream => stream.destroy())
      await Promise.allSettled(cores.map(core => core.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const createCore = swarms => {
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory(swarms),
      })
      cores.push(core)
      return core
    }

    const firstSwarms = []
    const firstCore = createCore(firstSwarms)
    await firstCore.start()
    const created = await firstCore.createChannel({
      name: 'android-meta',
      discover: false,
    })

    const renamed = await firstCore.setChannelRemark({
      channelName: created.channelKey,
      remark: 'Mobile team',
    })
    assert.equal(renamed.remark, 'Mobile team')

    const pinned = await firstCore.setChannelPinned({
      channelName: created.channelKey,
      pinned: true,
    })
    assert.equal(pinned.pinned, true)

    await firstCore.stop()

    const restartedSwarms = []
    const restartedCore = createCore(restartedSwarms)
    await restartedCore.start()
    const [restored] = restartedCore.listChannels()
    assert.equal(restored.remark, 'Mobile team')
    assert.equal(restored.pinned, true)

    restartedCore.joinChannelPresence({
      channelName: restored.channelKey,
      sessionId: 'android-leave-test',
      displayName: 'Android',
    })
    const chatSwarm = restartedSwarms[1]
    const connection = connectChannelControl(chatSwarm, streams)
    connection.protocol.send({
      type: 'channel-presence',
      peerId: 'desktop-peer',
      channelId: restored.channelId,
      channelKey: restored.channelKey,
      address: '0x0000000000000000000000000000000000000002',
      displayName: 'Desktop',
      status: 'online',
      sessionId: 'web',
      lastSeen: Date.now(),
    })
    await waitForTick()
    await restartedCore.sendChannelMessage({
      channelName: restored.channelKey,
      authorName: 'Android',
      content: 'before leave',
    })
    await restartedCore.getChannelMessages({
      channelName: restored.channelKey,
    })
    assert.equal(
      restartedCore.getSnapshot().channelPresence[restored.channelKey].length,
      2
    )
    assert.equal(
      restartedCore.getSnapshot().channelMessages[restored.channelKey].length,
      1
    )

    const leaveResult = await restartedCore.leaveChannel({
      channelName: restored.channelKey,
    })
    assert.equal(leaveResult.channelKey, restored.channelKey)
    assert.deepEqual(restartedCore.listChannels(), [])
    assert.equal(
      Object.hasOwn(
        restartedCore.getSnapshot().channelMessages,
        restored.channelKey
      ),
      false
    )
    assert.equal(
      Object.hasOwn(
        restartedCore.getSnapshot().channelPresence,
        restored.channelKey
      ),
      false
    )
  })

  it('round-trips structured attachment messages through the core', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-attachment-message-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-attachment',
      discover: false,
    })
    const link =
      'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png'

    await core.sendChannelMessage({
      channelName: channel.channelKey,
      authorName: 'Android',
      content: link,
      attachment: {
        kind: 'image',
        cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
        fileName: 'photo.png',
        link,
        mimeType: 'image/png',
        size: 12345,
      },
    })

    const [message] = await core.getChannelMessages({
      channelName: channel.channelKey,
    })
    assert.equal(message.content, link)
    assert.equal(
      message.attachment.cid,
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    )
    assert.equal(message.attachment.fileName, 'photo.png')
    assert.equal(message.attachment.kind, 'image')
  })

  it('rejects local attachment sends when content does not match the link', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-attachment-content-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-attachment-content',
      discover: false,
    })

    await assert.rejects(
      core.sendChannelMessage({
        channelName: channel.channelKey,
        authorName: 'Android',
        content: 'photo.png',
        attachment: {
          kind: 'image',
          cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
          fileName: 'photo.png',
          link: 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png',
        },
      }),
      /attachment content must match link/
    )
  })

  it('drops malformed remote attachment payloads when reading messages', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-malformed-attachment-')
    )
    const cores = []
    let externalStore = null
    t.after(async () => {
      await externalStore?.close()
      await Promise.allSettled(cores.map(core => core.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const createCore = swarms => {
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory(swarms),
      })
      cores.push(core)
      return core
    }

    const swarms = []
    const core = createCore(swarms)
    await core.start()
    const channel = await core.createChannel({
      name: 'android-malformed-attachment',
      discover: false,
    })
    const [persistedChannel] = JSON.parse(
      await fs.readFile(path.join(storagePath, CHANNELS_FILE), 'utf8')
    )
    await core.stop()

    externalStore = new Corestore(path.join(storagePath, 'stores', 'channels'))
    await externalStore.ready()
    const externalCore = externalStore
      .namespace(`channel-${channel.channelKey}`)
      .get({
        name: `messages-${persistedChannel.writerId}`,
        valueEncoding: 'json',
      })
    await externalCore.ready()
    await externalCore.append({
      type: 'message',
      author: DIAGNOSTIC_AUTHOR,
      authorName: 'Remote',
      content: 'bad attachment',
      timestamp: Date.now(),
      attachment: {
        kind: 'image',
        cid: '',
        fileName: 'bad.png',
        link: 'https://example.invalid/bad.png',
      },
    })
    await externalStore.close()
    externalStore = null

    const restartedSwarms = []
    const restartedCore = createCore(restartedSwarms)
    await restartedCore.start()
    const [message] = await restartedCore.getChannelMessages({
      channelName: channel.channelKey,
    })
    assert.equal(message.content, 'bad attachment')
    assert.equal(Object.hasOwn(message, 'attachment'), false)
    assert.equal(
      Object.hasOwn(
        restartedCore.getSnapshot().channelMessages[channel.channelKey][0],
        'attachment'
      ),
      false
    )
  })

  it('ignores append messages that resume after a channel is left', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-stale-append-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const originalGet = Hypercore.prototype.get
    const blocked = deferred()
    const release = deferred()
    let blockedOnce = false
    t.after(async () => {
      Hypercore.prototype.get = originalGet
      release.resolve()
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    Hypercore.prototype.get = async function delayedGet(...args) {
      const entry = await originalGet.apply(this, args)
      if (
        entry?.type === 'message' &&
        entry.content === 'stale after leave' &&
        !blockedOnce
      ) {
        blockedOnce = true
        blocked.resolve()
        await release.promise
      }
      return entry
    }

    await core.start()
    const channel = await core.createChannel({
      name: 'android-stale-append',
      discover: false,
    })

    const sendPromise = core.sendChannelMessage({
      channelName: channel.channelKey,
      authorName: 'Android',
      content: 'stale after leave',
    })
    await blocked.promise

    await core.leaveChannel({
      channelName: channel.channelKey,
    })
    release.resolve()
    await sendPromise
    await waitForTick()

    assert.equal(
      Object.hasOwn(core.getSnapshot().channelMessages, channel.channelKey),
      false
    )
    assert.deepEqual(core.listChannels(), [])
  })

  it('returns empty history when getChannelMessages resumes after leave', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-stale-history-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const originalGet = Hypercore.prototype.get
    const blocked = deferred()
    const release = deferred()
    let blockedOnce = false
    t.after(async () => {
      Hypercore.prototype.get = originalGet
      release.resolve()
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-stale-history',
      discover: false,
    })
    await core.sendChannelMessage({
      channelName: channel.channelKey,
      authorName: 'Android',
      content: 'history after leave',
    })

    Hypercore.prototype.get = async function delayedGet(...args) {
      const entry = await originalGet.apply(this, args)
      if (
        entry?.type === 'message' &&
        entry.content === 'history after leave' &&
        !blockedOnce
      ) {
        blockedOnce = true
        blocked.resolve()
        await release.promise
      }
      return entry
    }

    const messagesPromise = core.getChannelMessages({
      channelName: channel.channelKey,
    })
    await blocked.promise

    await core.leaveChannel({
      channelName: channel.channelKey,
    })
    release.resolve()
    const messages = await messagesPromise
    await waitForTick()

    assert.deepEqual(messages, [])
    assert.equal(
      Object.hasOwn(core.getSnapshot().channelMessages, channel.channelKey),
      false
    )
    assert.deepEqual(core.listChannels(), [])
  })

  it('does not reuse cached local candidates after leaving a channel', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-clear-candidate-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const firstChannel = await core.createChannel({
      name: 'android-clear-candidate',
      discover: false,
    })
    const oldWriterCoreKey = firstChannel.localWriterCoreKey
    assert.match(oldWriterCoreKey, /^[0-9a-f]{64}$/)

    await core.leaveChannel({
      channelName: firstChannel.channelKey,
    })

    const recreated = await core.createChannel({
      name: 'android-clear-candidate',
      discoveryTimeout: 0,
    })
    assert.notEqual(recreated.localWriterCoreKey, oldWriterCoreKey)
    assert.equal(recreated.writerCoreKeys.includes(oldWriterCoreKey), false)
  })
})
