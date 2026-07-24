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
import {
  CHANNELS_FILE,
  DIAGNOSTIC_AUTHOR,
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
} from './channel-protocol.mjs'
import { MobileP2PCore } from './mobile-core.mjs'

const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'

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

class RecordingStream extends EventEmitter {
  constructor() {
    super()
    this.destroyed = false
    this.writableEnded = false
    this.writes = []
  }

  write(data) {
    this.writes.push(b4a.toString(data))
    return true
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

function parseStreamWrites(stream, type) {
  return stream.writes
    .join('')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(message => message.type === type)
}

function channelPeerInfo(channelId) {
  const info = new EventEmitter()
  info.topics = [generateChannelChatDiscoveryKey(channelId)]
  return info
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
  it('recreates the downloads directory before writing a temporary file', async t => {
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
    await firstCore.stop()
    await fs.rm(path.join(storagePath, 'node-holdings.json'), {
      force: true,
    })

    const restartedCore = createCore([])
    await restartedCore.start()
    await fs.rm(path.join(storagePath, 'downloads'), {
      recursive: true,
      force: true,
    })

    const result = await restartedCore.downloadLink({ link })
    assert.equal(result.transfer.status, 'completed')
    assert.equal(await fs.readFile(result.savedPath, 'utf8'), content)
  })
})

describe('mobile local holding deletion', () => {
  it('clears local Hyperdrive content without publishing a tombstone', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-delete-holding-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const originalDel = Hyperdrive.prototype.del
    const originalClear = Hyperdrive.prototype.clear
    let delCalls = 0
    let clearCalls = 0

    t.after(async () => {
      Hyperdrive.prototype.del = originalDel
      Hyperdrive.prototype.clear = originalClear
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const published = await core.publishFile({
      name: 'local-delete.txt',
      contentBase64: b4a.toString(b4a.from('local content'), 'base64'),
    })

    Hyperdrive.prototype.del = async function (...args) {
      delCalls += 1
      return originalDel.apply(this, args)
    }
    Hyperdrive.prototype.clear = async function (...args) {
      clearCalls += 1
      return originalClear.apply(this, args)
    }

    await core.deleteHolding({ cid: published.transfer.cid })

    assert.equal(delCalls, 0)
    assert.equal(clearCalls, 1)
    assert.equal(core.getSnapshot().holdings.length, 0)
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
      name: 'android-presence',
      discover: false,
    })

    const chatSwarm = swarms[1]
    const stream = new RecordingStream()
    chatSwarm.emit('connection', stream, channelPeerInfo(channel.channelId))

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

    const presenceWrites = parseStreamWrites(stream, 'channel-presence')
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
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
      channelPresenceTimeoutMs: 100,
      channelPresenceSweepMs: 10,
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-presence-remote',
      discover: false,
    })

    const chatSwarm = swarms[1]
    const stream = new RecordingStream()
    chatSwarm.emit('connection', stream, channelPeerInfo(channel.channelId))
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-presence',
          peerId: 'desktop-peer',
          channelId: channel.channelId,
          channelKey: channel.channelKey,
          address: '0x0000000000000000000000000000000000000002',
          displayName: 'Desktop',
          status: 'online',
          sessionId: 'web',
          lastSeen: Date.now(),
        })}\n`
      )
    )

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

    stream.emit('close')
    await waitFor(
      () =>
        (core.getSnapshot().channelPresence[channel.channelKey]?.length ||
          0) === 0,
      'remote channel presence disconnect'
    )

    const staleStream = new RecordingStream()
    chatSwarm.emit(
      'connection',
      staleStream,
      channelPeerInfo(channel.channelId)
    )
    staleStream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-presence',
          peerId: 'stale-peer',
          channelId: channel.channelId,
          channelKey: channel.channelKey,
          address: '0x0000000000000000000000000000000000000003',
          displayName: 'Stale',
          status: 'online',
          sessionId: 'web',
          lastSeen: Date.now(),
        })}\n`
      )
    )
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

describe('mobile channel connection scoping', () => {
  it('does not exchange unrelated channel metadata or presence', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-channel-scope-')
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
    const sharedChannel = await core.createChannel({
      name: 'android-shared',
      discover: false,
    })
    const privateChannel = await core.createChannel({
      name: 'android-private',
      discover: false,
    })

    const stream = new RecordingStream()
    const peerInfo = channelPeerInfo(sharedChannel.channelId)
    swarms[1].emit('connection', stream, peerInfo)

    const helloChannels = parseStreamWrites(stream, 'channel-hello').flatMap(
      message => message.channels.map(channel => channel.channelId)
    )
    assert.deepEqual(helloChannels, [sharedChannel.channelId])

    core.joinChannelPresence({
      channelName: sharedChannel.channelKey,
      sessionId: 'shared-session',
      displayName: 'Android',
    })
    core.joinChannelPresence({
      channelName: privateChannel.channelKey,
      sessionId: 'private-session',
      displayName: 'Android',
    })
    assert.deepEqual(
      parseStreamWrites(stream, 'channel-presence').map(
        message => message.channelId
      ),
      [sharedChannel.channelId]
    )

    const unrelatedWriterKey = 'f'.repeat(64)
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-hello',
          peerId: 'unrelated-peer',
          channels: [
            {
              channelId: privateChannel.channelId,
              channelKey: privateChannel.channelKey,
              type: 'public',
              writerCoreKeys: [unrelatedWriterKey],
            },
          ],
        })}\n`
      )
    )
    await waitForTick()

    const currentPrivateChannel = core
      .listChannels()
      .find(channel => channel.channelId === privateChannel.channelId)
    assert.ok(
      !currentPrivateChannel.writerCoreKeys.includes(unrelatedWriterKey)
    )

    const privateTopic = generateChannelChatDiscoveryKey(
      privateChannel.channelId
    )
    peerInfo.topics.push(privateTopic)
    peerInfo.emit('topic', privateTopic)

    const latestHello = parseStreamWrites(stream, 'channel-hello').at(-1)
    assert.deepEqual(
      latestHello.channels.map(channel => channel.channelId).sort(),
      [privateChannel.channelId, sharedChannel.channelId].sort()
    )
  })

  it('does not let an unauthorized stream clear accepted presence', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-presence-scope-')
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
    const sharedChannel = await core.createChannel({
      name: 'presence-shared',
      discover: false,
    })
    const privateChannel = await core.createChannel({
      name: 'presence-private',
      discover: false,
    })
    const remoteAddress = '0x0000000000000000000000000000000000000002'
    const remotePeerId = 'desktop-peer'

    const acceptedStream = new RecordingStream()
    swarms[1].emit(
      'connection',
      acceptedStream,
      channelPeerInfo(sharedChannel.channelId)
    )
    acceptedStream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-presence',
          peerId: remotePeerId,
          channelId: sharedChannel.channelId,
          address: remoteAddress,
          status: 'online',
          sessionId: 'desktop',
        })}\n`
      )
    )
    await waitFor(
      () =>
        core.getSnapshot().channelPresence[sharedChannel.channelKey]?.length ===
        1,
      'accepted remote presence'
    )

    const unauthorizedStream = new RecordingStream()
    swarms[1].emit(
      'connection',
      unauthorizedStream,
      channelPeerInfo(privateChannel.channelId)
    )
    unauthorizedStream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-presence',
          peerId: remotePeerId,
          channelId: sharedChannel.channelId,
          address: remoteAddress,
          status: 'offline',
          sessionId: 'desktop',
        })}\n`
      )
    )
    await waitForTick()
    unauthorizedStream.emit('close')
    await waitForTick()

    assert.equal(
      core.getSnapshot().channelPresence[sharedChannel.channelKey]?.length,
      1
    )
  })
})

describe('mobile channel metadata management', () => {
  it('sets remark, pins, leaves, and persists metadata across restart', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-channel-meta-')
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
    const stream = new RecordingStream()
    chatSwarm.emit('connection', stream, channelPeerInfo(restored.channelId))
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-presence',
          peerId: 'desktop-peer',
          channelId: restored.channelId,
          channelKey: restored.channelKey,
          address: '0x0000000000000000000000000000000000000002',
          displayName: 'Desktop',
          status: 'online',
          sessionId: 'web',
          lastSeen: Date.now(),
        })}\n`
      )
    )
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

    externalStore = new Corestore(storagePath, {
      primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
      unsafe: true,
    })
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
