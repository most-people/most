import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Wallet } from 'ethers'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'node:stream'
import Hyperswarm from 'hyperswarm'
import { MostBoxEngine } from '../../src/index.js'
import { CHANNEL_PROOF_VERSION } from '../../src/core/channelHello.js'
import {
  channelTopics,
  createChannelProof,
  resolveChannelHandle,
} from '../../src/core/channelKeysV2.js'

import {
  presenceOptions,
  signedPresence,
  signedVoice,
  addressOf,
  defaultSigner,
} from '../helpers/signedMessage.js'
const alice = addressOf(defaultSigner)
const bobSigner = Wallet.createRandom()
const bob = addressOf(bobSigner)
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
  first.joinChannelPresence(
    channel,
    await presenceOptions(first, channel, 'online', {
      ownerAddress: alice,
      sessionId,
    })
  )
  await waitFor(
    () => presence(second, channel, alice),
    `presence for ${channel}`
  )
}

// v2: the public channel ID that replaces a channel handle on the wire.
function channelKey(handle) {
  return resolveChannelHandle(handle).channelKey
}

function chatTopic(handle) {
  return channelTopics(resolveChannelHandle(handle).key).chat.toString('hex')
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
    proof(handle, challenge = this.challenge) {
      const topic = chatTopic(handle)
      return {
        topic,
        proof: createChannelProof({
          key: resolveChannelHandle(handle).key,
          topic,
          challenge,
          proverPublicKey: publicKey,
          verifierPublicKey: swarm.keyPair.publicKey,
        }).toString('hex'),
      }
    },
    authorize(handle) {
      this.send({ type: 'channel-scope', topics: [chatTopic(handle)] })
      this.send({
        type: 'channel-proof',
        version: CHANNEL_PROOF_VERSION,
        challenge: this.challenge,
        proofs: [this.proof(handle)],
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
    const heartbeat = await presenceOptions(first, 'cached-0', 'heartbeat', {
      ownerAddress: alice,
      sessionId: 'warm-up',
    })
    const profile = await presenceOptions(first, 'cached-0', 'profile', {
      ownerAddress: alice,
      sessionId: 'warm-up',
      displayName: 'New profile',
      profileUpdatedAt: Date.now(),
    })
    first.heartbeatChannelPresence('cached-0', heartbeat)
    await tick()

    const hash = context.mock.method(crypto, 'createHash')
    for (let index = 0; index < 100; index++) {
      first.heartbeatChannelPresence('cached-0', heartbeat)
    }
    await tick()
    assert.equal(hash.mock.callCount(), 0)
    first.setChannelRemark('cached-0', 'renamed', { ownerAddress: alice })
    first.updateChannelPresenceProfile('cached-0', profile)
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

  it('sends both live sessions and a subsequent signed profile to a newly authorized peer', async context => {
    const test = await fixture(context)
    const first = await test.engine()
    const second = await test.engine()
    const channel = 'late-presence'
    for (const engine of [first, second]) await join(engine, channel)
    for (const sessionId of ['one', 'two']) {
      first.joinChannelPresence(
        channel,
        await presenceOptions(first, channel, 'online', { sessionId })
      )
    }
    const profile = name =>
      presenceOptions(first, channel, 'profile', {
        sessionId: 'two',
        displayName: name,
      })
    first.updateChannelPresenceProfile(channel, await profile('Before connect'))
    test.connect(first, second)
    await waitFor(
      () => presence(second, channel, alice)?.displayName === 'Before connect',
      'cached signed profile'
    )
    first.leaveChannelPresence(
      channel,
      await presenceOptions(first, channel, 'offline', { sessionId: 'two' })
    )
    first.updateChannelPresenceProfile(
      channel,
      await presenceOptions(first, channel, 'profile', {
        sessionId: 'one',
        displayName: 'Remaining tab',
      })
    )
    await waitFor(
      () => presence(second, channel, alice)?.displayName === 'Remaining tab',
      'remaining session after late connect'
    )
    first.leaveChannelPresence(
      channel,
      await presenceOptions(first, channel, 'offline', { sessionId: 'one' })
    )
    await waitFor(
      () => !presence(second, channel, alice),
      'last session leaving'
    )
  })

  it('revokes a leaving channel before closing cores and supports rejoining', async context => {
    const test = await fixture(context)
    const first = await test.engine()
    const second = await test.engine()
    const channel = 'leave-and-rejoin'
    await join(first, channel)
    await join(second, channel, bob)
    test.connect(first, second)
    first.joinChannelPresence(
      channel,
      await presenceOptions(first, channel, 'online', {
        ownerAddress: alice,
        sessionId: 'warm',
      })
    )
    await waitFor(
      () => presence(second, channel, alice, bob),
      'initial authorization'
    )
    const voices = []
    first.on('channel:voice', event => voices.push(event))
    const leaving = first.leaveChannel(channel, { ownerAddress: alice })
    second.sendChannelVoiceEvent(
      channel,
      await signedVoice(channelKey(channel), 'join', 'during-leave', {
        signer: bobSigner,
      }),
      { ownerAddress: bob, sourceId: 'ws:bob' }
    )
    await leaving
    await tick()
    assert.equal(voices.length, 0)
    assert.equal(first.listChannels({ ownerAddress: alice }).length, 0)

    await join(first, channel)
    second.sendChannelVoiceEvent(
      channel,
      await signedVoice(channelKey(channel), 'join', 'after-rejoin', {
        signer: bobSigner,
      }),
      { ownerAddress: bob, sourceId: 'ws:bob' }
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
            channel => channel.channelId === channelKey('imported-channel')
          )
      )
    )

    await target.clearUserData(alice)
    remote.frames.length = 0
    const removedChatTopic = chatTopic('imported-channel')
    remote.setTopics([removedChatTopic, chatTopic('retained-channel')])
    await tick()
    const scopes = remote.frames.filter(frame => frame.type === 'channel-scope')
    assert.ok(scopes.length > 0)
    assert.ok(scopes.every(frame => !frame.topics.includes(removedChatTopic)))
    const hellos = remote.frames.filter(frame => frame.type === 'channel-hello')
    assert.ok(hellos.length > 0)
    assert.ok(
      hellos.every(frame =>
        frame.channels.every(
          channel => channel.channelId !== channelKey('imported-channel')
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
        topics: [chatTopic('allowed-channel'), chatTopic('private-channel')],
      })
    }
    first.send({
      type: 'channel-proof',
      version: CHANNEL_PROOF_VERSION,
      challenge: first.challenge,
      proofs: [{ topic: chatTopic('allowed-channel'), proof: 'f'.repeat(64) }],
    })
    await tick()
    engine.joinChannelPresence(
      'allowed-channel',
      await presenceOptions(engine, 'allowed-channel', 'online', {
        ownerAddress: alice,
        sessionId: 'online',
      })
    )
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
    engine.heartbeatChannelPresence(
      'allowed-channel',
      await presenceOptions(engine, 'allowed-channel', 'heartbeat', {
        ownerAddress: alice,
        sessionId: 'online',
      })
    )
    assert.ok(!second.frames.some(frame => frame.type === 'channel-presence'))

    const voices = []
    engine.on('channel:voice', event => voices.push(event))
    first.send({
      type: 'channel-voice',
      peerId: 'untrusted-peer',
      channelId: channelKey('private-channel'),
      event: 'join',
      sessionId: 'untrusted-session',
      sender: { address: bob },
    })
    engine.joinChannelPresence(
      'private-channel',
      await presenceOptions(engine, 'private-channel', 'online', {
        ownerAddress: alice,
        sessionId: 'private',
      })
    )
    await tick()
    assert.equal(voices.length, 0)
    assert.ok(
      first.frames.every(
        frame =>
          frame.type !== 'channel-presence' ||
          frame.body.channelId !== channelKey('private-channel')
      )
    )
    assert.ok(
      first.frames
        .filter(frame => frame.type === 'channel-hello')
        .every(frame =>
          frame.channels.every(
            channel => channel.channelId !== channelKey('private-channel')
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
      topics: [chatTopic('allowed-channel')],
    })
    replacement.send({
      type: 'channel-proof',
      version: CHANNEL_PROOF_VERSION,
      challenge: replacement.challenge,
      proofs: [first.proof('allowed-channel')],
    })
    engine.heartbeatChannelPresence(
      'allowed-channel',
      await presenceOptions(engine, 'allowed-channel', 'heartbeat', {
        ownerAddress: alice,
        sessionId: 'online',
      })
    )
    assert.ok(
      !replacement.frames.some(frame => frame.type === 'channel-presence')
    )
    replacement.authorize('allowed-channel')
    assert.ok(
      replacement.frames.some(frame => frame.type === 'channel-presence')
    )
  })

  it('sends signed signal frames only to the target swarm stream and drops unknown targets', async context => {
    const discovery = mockDiscovery(context)
    const test = await fixture(context)
    const engine = await test.engine(false)
    const handle = 'voice-stream-routing'
    await join(engine, handle)
    const channelId = channelKey(handle)
    const peers = [1, 2].map(() => remoteConnection(discovery.swarms.at(-1)))
    for (const peer of peers) {
      test.track(peer)
      peer.authorize(handle)
    }
    await tick()
    const frame = signed => ({ v: 2, type: 'channel-voice', ...signed })
    peers[0].send(frame(await signedVoice(channelId, 'join', 'target')))
    const options = { ownerAddress: alice, sourceId: 'ws:local' }
    const signed = await signedVoice(channelId, 'signal', 'caller', {
      targetSessionId: 'target',
      transport: 'webrtc1',
      signal: { type: 'offer', sdp: 'v=0' },
    })
    engine.sendChannelVoiceEvent(handle, signed, options)
    assert.deepEqual(
      peers[0].frames.filter(f => f.type === 'channel-voice'),
      [frame(signed)]
    )
    assert.ok(!peers[1].frames.some(f => f.type === 'channel-voice'))
    const delivered = []
    engine.on('channel:voice', (event, target) =>
      delivered.push({ event, target })
    )
    peers[0].send(
      frame(
        await signedVoice(channelId, 'signal', 'target', {
          targetSessionId: 'caller',
          transport: 'webrtc1',
          signal: { type: 'answer', sdp: 'v=0' },
        })
      )
    )
    assert.deepEqual(
      delivered.map(e => e.target),
      ['ws:local']
    )
    peers[0].close()
    await tick()
    assert.equal(engine.sendChannelVoiceEvent(handle, signed, options), null)
  })

  it('sends the session frame first and requires signatures from peers that list no features', async context => {
    const discovery = mockDiscovery(context)
    const test = await fixture(context)
    const engine = await test.engine(false)
    const handle = 'session-features'
    await join(engine, handle)
    const channelId = channelKey(handle)
    const delivered = []
    engine.on('channel:voice', event => delivered.push(event))

    // These peers send no session frame, or one listing only other
    // features: sig1 is never negotiated away.
    for (const features of [null, ['e2ee1']]) {
      const remote = remoteConnection(discovery.swarms.at(-1))
      test.track(remote)
      assert.deepEqual(remote.frames[0], {
        v: 2,
        type: 'session',
        features: ['sig1'],
      })
      if (features) remote.send({ v: 2, type: 'session', features })
      remote.authorize(handle)
      await tick()

      const sessionId = `unsigned-${features ? 'listed' : 'none'}`
      const presenceFrame = await signedPresence(channelId, 'online', {
        sessionId,
      })
      remote.send({ v: 2, type: 'channel-presence', body: presenceFrame.body })
      const voiceFrame = await signedVoice(channelId, 'join', sessionId)
      remote.send({ v: 2, type: 'channel-voice', body: voiceFrame.body })
      await tick()
      assert.equal(presence(engine, handle, alice), undefined)
      assert.equal(delivered.length, 0)
      remote.close()
      await tick()
    }

    // Control: the same frames signed are accepted from a peer without one.
    const remote = remoteConnection(discovery.swarms.at(-1))
    test.track(remote)
    remote.authorize(handle)
    await tick()
    remote.send({
      v: 2,
      type: 'channel-presence',
      ...(await signedPresence(channelId, 'online', { sessionId: 'signed' })),
    })
    remote.send({
      v: 2,
      type: 'channel-voice',
      ...(await signedVoice(channelId, 'join', 'signed')),
    })
    await waitFor(() => presence(engine, handle, alice), 'signed presence')
    await waitFor(() => delivered.length === 1, 'signed voice')
  })

  it('identifies channels on the wire only by their public channel ID', async context => {
    const discovery = mockDiscovery(context)
    const test = await fixture(context)
    const engine = await test.engine(false)
    await join(engine, 'wire-channel')
    const remote = remoteConnection(discovery.swarms.at(-1))
    test.track(remote)
    remote.authorize('wire-channel')
    engine.joinChannelPresence(
      'wire-channel',
      await presenceOptions(engine, 'wire-channel', 'online', {
        ownerAddress: alice,
        sessionId: 'wire',
      })
    )
    await tick()

    const hello = remote.frames.find(frame => frame.type === 'channel-hello')
    assert.deepEqual(
      hello.channels.map(channel => channel.channelId),
      [channelKey('wire-channel')]
    )
    assert.equal(hello.channels[0].channelKey, undefined)
    const presenceFrame = remote.frames.find(
      frame => frame.type === 'channel-presence'
    )
    assert.equal(presenceFrame.body.channelId, channelKey('wire-channel'))
    assert.ok(
      remote.frames.every(
        frame => !JSON.stringify(frame).includes('wire-channel')
      )
    )
  })
})
