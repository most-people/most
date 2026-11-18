import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { WebSocket } from 'ws'
import { createApp, createWebSocketServer } from '../../index.js'
import { MostBoxEngine } from '../../src/index.js'

import {
  addressOf,
  defaultSigner,
  signedPresence,
} from '../helpers/signedMessage.js'

const TEST_PORT = 19773
const baseUrl = 'http://localhost:' + TEST_PORT
const wsUrl = 'ws://localhost:' + TEST_PORT + '/ws'
const OWNER = '0x2222222222222222222222222222222222222222'

describe('voice WebSocket signaling (integration)', { timeout: 30000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-voice-ws-test-'))
  let serverInstance
  let wss
  let engine
  let appRuntime

  before(async () => {
    const dataPath = path.join(tmpDir, 'data')
    fs.mkdirSync(dataPath, { recursive: true })
    engine = new MostBoxEngine({ dataPath })
    await engine.start()

    const wssRef = { current: null }
    const serverInstanceRef = { current: null }
    appRuntime = createApp(engine, {
      port: TEST_PORT,
      wssRef,
      serverInstanceRef,
    })

    serverInstance = serve({
      fetch: appRuntime.app.fetch,
      port: TEST_PORT,
      hostname: 'localhost',
    })
    serverInstanceRef.current = serverInstance

    wss = createWebSocketServer({
      engine,
      serverInstance,
      validateWebSocketRequest: () => true,
      getWebSocketUserAddress: req => {
        const url = new URL(req.url, baseUrl)
        return url.searchParams.get('owner') || ''
      },
      subscribeToChannel: appRuntime.subscribeToChannel,
      unsubscribeFromChannel: appRuntime.unsubscribeFromChannel,
      cleanupWsSubscriptions: appRuntime.cleanupWsSubscriptions,
    })
    wssRef.current = wss

    engine.on('channel:voice', data =>
      appRuntime.wsSendToChannel(data.channelKey, 'channel:voice', data)
    )

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
    if (wss) wss.close()
    if (serverInstance) serverInstance.close()
    if (engine) await engine.stop()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function connectClient(owner = OWNER) {
    return new Promise((resolve, reject) => {
      const url = new URL(wsUrl)
      if (owner) url.searchParams.set('owner', owner)
      const ws = new WebSocket(url)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
  }

  function receivesMessage(ws, timeout = 200) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), timeout)
      ws.once('message', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  function waitForMessage(ws, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout waiting for message')),
        timeout
      )
      ws.once('message', data => {
        clearTimeout(timer)
        resolve(JSON.parse(data.toString()))
      })
    })
  }

  it('broadcasts authenticated voice join events to channel subscribers', async () => {
    const channelName = 'voice-ws-room'
    await engine.createChannel(channelName, 'personal', {
      ownerAddress: OWNER,
      displayName: 'Alice',
    })

    const ws = await connectClient()
    ws.send(
      JSON.stringify({
        event: 'channel:subscribe',
        data: { channel: channelName },
      })
    )
    await new Promise(r => setTimeout(r, 50))

    const pending = waitForMessage(ws)
    ws.send(
      JSON.stringify({
        event: 'channel:voice:join',
        data: {
          channel: channelName,
          sessionId: 'voice-ws-local',
          displayName: 'Mallory',
          micMuted: false,
          sender: {
            address: '0xffffffffffffffffffffffffffffffffffffffff',
          },
        },
      })
    )

    const message = await pending
    assert.strictEqual(message.event, 'channel:voice')
    assert.strictEqual(message.data.event, 'join')
    assert.strictEqual(message.data.sessionId, 'voice-ws-local')
    assert.strictEqual(message.data.sender.address, OWNER)
    assert.strictEqual(message.data.sender.displayName, 'Mallory')
    assert.strictEqual(message.data.micMuted, false)

    ws.close()
  })

  it('binds signed presence to the socket account and action, and expires an abruptly closed session remotely', async t => {
    const ownerAddress = addressOf(defaultSigner)
    const channel = 'signed-presence-ws'
    const { channelKey } = await engine.createChannel(channel, 'public', {
      ownerAddress,
    })
    const peer = new MostBoxEngine({
      dataPath: path.join(tmpDir, 'presence-peer'),
      disableNetwork: true,
    })
    await peer.start()
    const replica = engine.replicateWith(peer)
    const first = await connectClient(ownerAddress)
    const second = await connectClient(ownerAddress)
    t.after(async () => {
      first.terminate()
      second.terminate()
      replica.close()
      await peer.stop()
    })
    await peer.createChannel(channel, 'public', { ownerAddress })
    const envelope = (status, sessionId, fields) =>
      signedPresence(channelKey, status, { sessionId, ...fields })
    const send = (ws, action, signed) =>
      ws.send(
        JSON.stringify({
          event: 'channel:presence:' + action,
          data: { channel, signed },
        })
      )
    // The acknowledgement is ordered after all earlier frames on this socket.
    const flush = async ws => {
      const ack = waitForMessage(ws)
      ws.send(JSON.stringify({ event: 'channel:subscribe', data: { channel } }))
      assert.equal((await ack).event, 'channel:subscribed')
    }
    const local = () => engine.getChannelPresence(channel, { ownerAddress })
    const remote = () => peer.getChannelPresence(channel, { ownerAddress })
    const online = await envelope('online', 'first')
    send(first, 'join', undefined)
    send(first, 'join', await envelope('offline', 'first'))
    send(first, 'join', {
      ...online,
      body: { ...online.body, sessionId: 'different' },
    })
    // A valid envelope from a different account is still not this socket's.
    const other = await connectClient(OWNER)
    try {
      await engine.createChannel(channel, 'public', { ownerAddress: OWNER })
      send(other, 'join', online)
      await flush(other)
    } finally {
      other.terminate()
    }
    await flush(first)
    assert.deepEqual(local(), [])

    send(first, 'join', online)
    await flush(first)
    send(
      second,
      'join',
      await envelope('online', 'second', { displayName: 'Second' })
    )
    await flush(second)
    send(first, 'leave', await envelope('offline', 'first'))
    await flush(first)
    assert.equal(local()[0]?.displayName, 'Second')
    const deadline = Date.now() + 5000
    while (remote()[0]?.displayName !== 'Second' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(remote()[0]?.displayName, 'Second')
    const gone = new Promise(resolve =>
      engine.once('channel:presence', resolve)
    )
    second.terminate()
    assert.equal((await gone).status, 'offline')
    assert.deepEqual(local(), [])
    assert.equal(remote()[0]?.online, true)
    const receipt = remote()[0].lastSeen
    const clock = t.mock.method(Date, 'now', () => receipt + 45001)
    try {
      assert.deepEqual(remote(), [])
    } finally {
      clock.mock.restore()
    }
  })

  it('does not subscribe unauthenticated WebSocket clients to channels', async () => {
    const channelName = 'voice-ws-unauthenticated'
    await engine.createChannel(channelName, 'personal', {
      ownerAddress: OWNER,
      displayName: 'Alice',
    })

    const ws = await connectClient('')
    ws.send(
      JSON.stringify({
        event: 'channel:subscribe',
        data: { channel: channelName },
      })
    )
    await new Promise(resolve => setTimeout(resolve, 50))

    const pending = receivesMessage(ws)
    appRuntime.wsSendToChannel(channelName, 'channel:message', {
      content: 'private',
    })

    assert.strictEqual(await pending, false)
    ws.close()
  })

  it('does not subscribe authenticated non-members to channels', async () => {
    const channelName = 'voice-ws-non-member'
    await engine.createChannel(channelName, 'personal', {
      ownerAddress: OWNER,
      displayName: 'Alice',
    })

    const ws = await connectClient('0x3333333333333333333333333333333333333333')
    ws.send(
      JSON.stringify({
        event: 'channel:subscribe',
        data: { channel: channelName },
      })
    )
    await new Promise(resolve => setTimeout(resolve, 50))

    const pending = receivesMessage(ws)
    appRuntime.wsSendToChannel(channelName, 'channel:message', {
      content: 'private',
    })

    assert.strictEqual(await pending, false)
    ws.close()
  })
})
