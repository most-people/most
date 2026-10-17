import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'node:stream'
import Hyperswarm from 'hyperswarm'
import { MostBoxEngine } from '../../src/index.js'
import { CHANNEL_NAME_PREFIX } from '../../src/config.js'
import {
  CHANNEL_PROOF_VERSION,
  createChannelTopicProof,
} from '../../src/core/channelHello.js'

const alice = `0x${'1'.repeat(40)}`
const bob = `0x${'2'.repeat(40)}`
const tick = () => new Promise(resolve => setImmediate(resolve))

async function waitFor(check, description) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail(`Timed out waiting for ${description}`)
}

async function fixture(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-channel-auth-'))
  const engines = []
  const connections = []
  context.after(async () => {
    for (const connection of connections) connection.close()
    for (const engine of engines) await engine.stop()
    const resolved = path.resolve(directory)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('most-channel-auth-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  })
  return {
    async engine(disableNetwork = true) {
      const engine = new MostBoxEngine({
        dataPath: path.join(directory, String(engines.length)),
        disableNetwork,
      })
      engines.push(engine)
      await engine.start()
      return engine
    },
    connect(first, second) {
      const connection = first.replicateWith(second)
      connections.push(connection)
      return connection
    },
    track(connection) {
      connections.push(connection)
    },
  }
}

async function join(engine, channel, ownerAddress = alice) {
  return engine.createChannel(channel, 'public', { ownerAddress })
}

function presence(engine, channel, address, ownerAddress = alice) {
  return engine
    .getChannelPresence(channel, { ownerAddress })
    .find(item => item.address === address)
}

async function expectPresence(first, second, channel, sessionId) {
  first.joinChannelPresence(channel, { ownerAddress: alice, sessionId })
  await waitFor(
    () => presence(second, channel, alice),
    `presence for ${channel}`
  )
}

function idTopic(channelId) {
  return crypto
    .createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}id:${channelId}:candidates`)
    .digest('hex')
}

function chatTopic(channelId) {
  return crypto
    .createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}channel:${channelId}:chat`)
    .digest('hex')
}

function mockDiscovery(context) {
  const swarms = []
  context.mock.method(Hyperswarm.prototype, 'join', function () {
    if (!swarms.includes(this)) swarms.push(this)
    return {}
  })
  context.mock.method(Hyperswarm.prototype, 'leave', async () => {})
  return { swarms }
}

function remoteConnection(swarm, publicKey = crypto.randomBytes(32)) {
  const frames = []
  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      for (const line of chunk.toString().trim().split('\n')) {
        frames.push(JSON.parse(line))
      }
      callback()
    },
  })
  const info = new EventEmitter()
  info.publicKey = publicKey
  info.topics = []
  swarm.emit('connection', stream, info)
  stream.emit(
    'data',
    Buffer.from(
      JSON.stringify({
        type: 'channel-proof-challenge',
        version: CHANNEL_PROOF_VERSION,
        challenge: crypto.randomBytes(32).toString('hex'),
      }) + '\n'
    )
  )
  return {
    frames,
    publicKey,
    challenge: frames.find(frame => frame.type === 'channel-proof-challenge')
      .challenge,
    send(frame) {
      stream.emit('data', Buffer.from(JSON.stringify(frame) + '\n'))
    },
    setTopics(topics) {
      info.topics = topics.map(topic => Buffer.from(topic, 'hex'))
      info.emit('topic')
    },
    proof(channelId, challenge = this.challenge) {
      const topic = idTopic(channelId)
      return {
        topic,
        proof: createChannelTopicProof({
          channelId,
          topic,
          challenge,
          proverPublicKey: publicKey,
          verifierPublicKey: swarm.keyPair.publicKey,
        }),
      }
    },
    authorize(channelId) {
      this.send({ type: 'channel-scope', topics: [idTopic(channelId)] })
      this.send({
        type: 'channel-proof',
        version: CHANNEL_PROOF_VERSION,
        challenge: this.challenge,
        proofs: [this.proof(channelId)],
      })
    },
    close() {
      stream.destroy()
    },
  }
}

describe('channel authorization cache', () => {
  it('does not hash discovery topics again for repeated heartbeats or profile-only changes', async context => {
    const test = await fixture(context)
    const first = await test.engine()
    const second = await test.engine()
    for (let index = 0; index < 10; index++) {
      await join(first, `cached-${index}`)
    }
    await join(second, 'cached-0')
    test.connect(first, second)
    await expectPresence(first, second, 'cached-0', 'warm-up')
    first.heartbeatChannelPresence('cached-0', {
      ownerAddress: alice,
      sessionId: 'warm-up',
    })
    await tick()

    const hash = context.mock.method(crypto, 'createHash')
    for (let index = 0; index < 100; index++) {
      first.heartbeatChannelPresence('cached-0', {
        ownerAddress: alice,
        sessionId: 'warm-up',
      })
    }
    await tick()
    assert.equal(hash.mock.callCount(), 0)
    first.setChannelRemark('cached-0', 'renamed', { ownerAddress: alice })
    first.updateChannelPresenceProfile('cached-0', {
      ownerAddress: alice,
      sessionId: 'warm-up',
      displayName: 'New profile',
      profileUpdatedAt: Date.now(),
    })
    await tick()
    assert.equal(hash.mock.callCount(), 0)
    assert.equal(presence(second, 'cached-0', alice).displayName, 'New profile')
  })

  it('authorizes newly shared channels on an already connected stream', async context => {
    const test = await fixture(context)
    const first = await test.engine()
    const second = await test.engine()
    test.connect(first, second)
    await tick()
    for (const channel of ['shared-before', 'shared-after']) {
      await join(first, channel)
      await join(second, channel)
      await expectPresence(first, second, channel, channel)
    }
  })

  it('revokes a leaving channel before closing cores and supports rejoining', async context => {
    const test = await fixture(context)
    const first = await test.engine()
    const second = await test.engine()
    const channel = 'leave-and-rejoin'
    await join(first, channel)
    await join(second, channel, bob)
    test.connect(first, second)
    first.joinChannelPresence(channel, {
      ownerAddress: alice,
      sessionId: 'warm',
    })
    await waitFor(
      () => presence(second, channel, alice, bob),
      'initial authorization'
    )
    const voices = []
    first.on('channel:voice', event => voices.push(event))
    const leaving = first.leaveChannel(channel, { ownerAddress: alice })
    second.sendChannelVoiceEvent(
      channel,
      { event: 'join', sessionId: 'during-leave' },
      { ownerAddress: bob }
    )
    await leaving
    await tick()
    assert.equal(voices.length, 0)
    assert.equal(first.listChannels({ ownerAddress: alice }).length, 0)

    await join(first, channel)
    second.sendChannelVoiceEvent(
      channel,
      { event: 'join', sessionId: 'after-rejoin' },
      { ownerAddress: bob }
    )
    await waitFor(
      () => voices.some(event => event.sessionId === 'after-rejoin'),
      'voice after rejoining'
    )
  })

  it('refreshes imported channels and removes cleared users from hello messages', async context => {
    const discovery = mockDiscovery(context)
    const test = await fixture(context)
    const source = await test.engine()
    await join(source, 'imported-channel')
    const target = await test.engine(false)
    await join(target, 'retained-channel', bob)
    const remote = remoteConnection(discovery.swarms.at(-1))
    test.track(remote)
    remote.authorize('retained-channel')
    await tick()
    const imported = await target.importUserData(
      alice,
      source.exportUserData(alice)
    )
    assert.equal(imported.channelsAdded, 1)
    remote.authorize('imported-channel')
    await tick()
    assert.ok(
      remote.frames.some(
        frame =>
          frame.type === 'channel-hello' &&
          frame.channels.some(
            channel => channel.channelId === 'imported-channel'
          )
      )
    )

    await target.clearUserData(alice)
    remote.frames.length = 0
    const removedChatTopic = chatTopic('imported-channel')
    remote.setTopics([removedChatTopic, idTopic('retained-channel')])
    await tick()
    const scopes = remote.frames.filter(frame => frame.type === 'channel-scope')
    assert.ok(scopes.length > 0)
    assert.ok(scopes.every(frame => !frame.topics.includes(removedChatTopic)))
    const hellos = remote.frames.filter(frame => frame.type === 'channel-hello')
    assert.ok(hellos.length > 0)
    assert.ok(
      hellos.every(frame =>
        frame.channels.every(
          channel => channel.channelId !== 'imported-channel'
        )
      )
    )
  })

  it('starts fresh authorization after disconnecting and restarting the same engine', async context => {
    const test = await fixture(context)
    const first = await test.engine()
    const second = await test.engine()
    await join(first, 'restart-channel')
    await join(second, 'restart-channel')
    const connection = test.connect(first, second)
    await expectPresence(first, second, 'restart-channel', 'before-restart')
    connection.close()
    await waitFor(
      () => !presence(second, 'restart-channel', alice),
      'presence cleanup after disconnecting'
    )
    await first.stop()
    await first.start()
    test.connect(first, second)
    await expectPresence(first, second, 'restart-channel', 'after-restart')
  })

  it('keeps proofs and cached authorization isolated between streams and channels', async context => {
    const discovery = mockDiscovery(context)
    const test = await fixture(context)
    const engine = await test.engine(false)
    await join(engine, 'allowed-channel')
    await join(engine, 'private-channel')
    const swarm = discovery.swarms.at(-1)
    const first = remoteConnection(swarm)
    const second = remoteConnection(swarm)
    test.track(first)
    test.track(second)
    for (const remote of [first, second]) {
      remote.send({
        type: 'channel-scope',
        topics: [idTopic('allowed-channel'), idTopic('private-channel')],
      })
    }
    first.send({
      type: 'channel-proof',
      version: CHANNEL_PROOF_VERSION,
      challenge: first.challenge,
      proofs: [{ topic: idTopic('allowed-channel'), proof: 'f'.repeat(64) }],
    })
    await tick()
    engine.joinChannelPresence('allowed-channel', {
      ownerAddress: alice,
      sessionId: 'online',
    })
    assert.ok(
      [first, second].every(
        remote =>
          !remote.frames.some(frame => frame.type === 'channel-presence')
      )
    )

    first.authorize('allowed-channel')
    await tick()
    assert.ok(first.frames.some(frame => frame.type === 'channel-presence'))
    for (const challenge of [first.challenge, second.challenge]) {
      second.send({
        type: 'channel-proof',
        version: CHANNEL_PROOF_VERSION,
        challenge,
        proofs: [first.proof('allowed-channel')],
      })
    }
    second.send({
      type: 'channel-proof',
      version: CHANNEL_PROOF_VERSION,
      challenge: second.challenge,
      proofs: [second.proof('allowed-channel', first.challenge)],
    })
    await tick()
    engine.heartbeatChannelPresence('allowed-channel', {
      ownerAddress: alice,
      sessionId: 'online',
    })
    assert.ok(!second.frames.some(frame => frame.type === 'channel-presence'))

    const voices = []
    engine.on('channel:voice', event => voices.push(event))
    first.send({
      type: 'channel-voice',
      peerId: 'untrusted-peer',
      channelId: 'private-channel',
      event: 'join',
      sessionId: 'untrusted-session',
      sender: { address: bob },
    })
    engine.joinChannelPresence('private-channel', {
      ownerAddress: alice,
      sessionId: 'private',
    })
    await tick()
    assert.equal(voices.length, 0)
    assert.ok(
      first.frames.every(
        frame =>
          frame.type !== 'channel-presence' ||
          frame.channelId !== 'private-channel'
      )
    )
    assert.ok(
      first.frames
        .filter(frame => frame.type === 'channel-hello')
        .every(frame =>
          frame.channels.every(
            channel => channel.channelId !== 'private-channel'
          )
        )
    )
    second.authorize('allowed-channel')
    await tick()
    assert.ok(second.frames.some(frame => frame.type === 'channel-presence'))

    first.close()
    await tick()
    const replacement = remoteConnection(swarm, first.publicKey)
    test.track(replacement)
    replacement.send({
      type: 'channel-scope',
      topics: [idTopic('allowed-channel')],
    })
    replacement.send({
      type: 'channel-proof',
      version: CHANNEL_PROOF_VERSION,
      challenge: replacement.challenge,
      proofs: [first.proof('allowed-channel')],
    })
    engine.heartbeatChannelPresence('allowed-channel', {
      ownerAddress: alice,
      sessionId: 'online',
    })
    assert.ok(
      !replacement.frames.some(frame => frame.type === 'channel-presence')
    )
    replacement.authorize('allowed-channel')
    assert.ok(
      replacement.frames.some(frame => frame.type === 'channel-presence')
    )
  })

  it('includes temporary ID discovery in proofs and expires it before creating a local channel', async context => {
    const discovery = mockDiscovery(context)
    const test = await fixture(context)
    const engine = await test.engine(false)
    await join(engine, 'permanent-channel')
    const remote = remoteConnection(discovery.swarms.at(-1))
    test.track(remote)
    remote.authorize('permanent-channel')
    await tick()
    const temporaryTopic = idTopic('temporary-channel')
    const pending = engine.createChannel('temporary-channel', 'public', {
      ownerAddress: alice,
      discover: true,
      discoveryTimeout: 500,
    })
    try {
      await tick()
      remote.authorize('temporary-channel')
      await tick()
      assert.ok(
        remote.frames.some(
          frame =>
            frame.type === 'channel-proof' &&
            frame.proofs.some(item => item.topic === temporaryTopic)
        )
      )

      // Probe after temporary discovery is removed, before local core creation
      // can join the permanent discovery topics and authorize that ID again.
      let acceptedExpiredHello = false
      engine.on('channel:peer:online', event => {
        if (event.peerId === 'expired-temporary-peer')
          acceptedExpiredHello = true
      })
      const leave = context.mock.method(
        Hyperswarm.prototype,
        'leave',
        async function (topic) {
          if (Buffer.from(topic).toString('hex') !== temporaryTopic) return
          remote.send({
            type: 'channel-hello',
            peerId: 'expired-temporary-peer',
            channels: [{ channelId: 'temporary-channel', writerCoreKeys: [] }],
          })
        }
      )
      await pending
      assert.ok(
        leave.mock.calls.some(
          call =>
            Buffer.from(call.arguments[0]).toString('hex') === temporaryTopic
        )
      )
      assert.equal(acceptedExpiredHello, false)
      engine.joinChannelPresence('temporary-channel', {
        ownerAddress: alice,
        sessionId: 'permanent',
      })
      await tick()
      assert.ok(
        remote.frames.some(
          frame =>
            frame.type === 'channel-presence' &&
            frame.channelId === 'temporary-channel'
        )
      )
    } finally {
      await pending
    }
  })
})
