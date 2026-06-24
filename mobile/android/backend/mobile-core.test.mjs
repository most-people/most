import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import b4a from 'b4a'
import {
  CHANNELS_FILE,
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
} from './channel-protocol.mjs'
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
