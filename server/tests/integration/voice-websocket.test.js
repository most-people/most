import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { WebSocket } from 'ws'
import { createApp, createWebSocketServer } from '../../index.js'
import { MostBoxEngine } from '../../src/index.js'

const TEST_PORT = 19773
const baseUrl = 'http://localhost:' + TEST_PORT
const wsUrl = 'ws://localhost:' + TEST_PORT + '/ws'
const OWNER = '0x2222222222222222222222222222222222222222'

describe('voice WebSocket signaling (integration)', { timeout: 30000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-voice-ws-test-'))
  let serverInstance
  let wss
  let engine

  before(async () => {
    const dataPath = path.join(tmpDir, 'data')
    fs.mkdirSync(dataPath, { recursive: true })
    engine = new MostBoxEngine({ dataPath })
    await engine.start()

    const wssRef = { current: null }
    const serverInstanceRef = { current: null }
    const result = createApp(engine, {
      port: TEST_PORT,
      wssRef,
      serverInstanceRef,
    })

    serverInstance = serve({
      fetch: result.app.fetch,
      port: TEST_PORT,
      hostname: 'localhost',
    })
    serverInstanceRef.current = serverInstance

    wss = createWebSocketServer({
      engine,
      serverInstance,
      validateWebSocketRequest: () => true,
      getWebSocketUserAddress: () => OWNER,
      subscribeToChannel: result.subscribeToChannel,
      unsubscribeFromChannel: result.unsubscribeFromChannel,
      cleanupWsSubscriptions: result.cleanupWsSubscriptions,
    })
    wssRef.current = wss

    engine.on('channel:voice', data =>
      result.wsSendToChannel(data.channelKey, 'channel:voice', data)
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

  function connectClient() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
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

  async function waitForPresence(channelName, predicate, timeout = 3000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeout) {
      const presence = engine.getChannelPresence(channelName, {
        ownerAddress: OWNER,
      })
      const match = presence.find(predicate)
      if (match) return match
      await new Promise(r => setTimeout(r, 25))
    }
    throw new Error('Timeout waiting for presence')
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

  it('passes presence identity through WebSocket join and profile events', async () => {
    const channelName = 'presence-ws-room'
    await engine.createChannel(channelName, 'personal', {
      ownerAddress: OWNER,
      displayName: 'Alice',
    })

    const ws = await connectClient()
    ws.send(
      JSON.stringify({
        event: 'channel:presence:join',
        data: {
          channel: channelName,
          sessionId: 'presence-ws-local',
          displayName: 'Alice',
          identity: 'service',
          profileUpdatedAt: 1,
        },
      })
    )

    const joined = await waitForPresence(
      channelName,
      item => item.address === OWNER && item.identity === 'service'
    )
    assert.strictEqual(joined.displayName, 'Alice')

    ws.send(
      JSON.stringify({
        event: 'channel:presence:profile',
        data: {
          channel: channelName,
          sessionId: 'presence-ws-local',
          displayName: 'Alice AI',
          identity: 'service_ai',
          profileUpdatedAt: 2,
        },
      })
    )

    const updated = await waitForPresence(
      channelName,
      item => item.address === OWNER && item.identity === 'service_ai'
    )
    assert.strictEqual(updated.displayName, 'Alice AI')

    ws.close()
  })

  it('reports stale channel WebSocket events without logging backend errors', async () => {
    const otherOwner = '0x3333333333333333333333333333333333333333'
    const privateChannel = 'presence-ws-private-room'
    await engine.createChannel(privateChannel, 'personal', {
      ownerAddress: otherOwner,
      displayName: 'Bob',
    })

    const loggedErrors = []
    const originalError = console.error
    console.error = (...args) => {
      loggedErrors.push(args)
    }

    const ws = await connectClient()
    try {
      const missingChannel = waitForMessage(ws)
      ws.send(
        JSON.stringify({
          event: 'channel:presence:heartbeat',
          data: {
            channel: 'presence-ws-missing-room',
            sessionId: 'stale-tab',
          },
        })
      )
      const missingMessage = await missingChannel
      assert.strictEqual(missingMessage.event, 'channel:error')
      assert.strictEqual(
        missingMessage.data.event,
        'channel:presence:heartbeat'
      )
      assert.strictEqual(missingMessage.data.channel, 'presence-ws-missing-room')
      assert.strictEqual(missingMessage.data.code, 'CHANNEL_NOT_FOUND')
      assert.strictEqual(missingMessage.data.error, '频道不存在')

      const deniedChannel = waitForMessage(ws)
      ws.send(
        JSON.stringify({
          event: 'channel:presence:join',
          data: {
            channel: privateChannel,
            sessionId: 'wrong-owner-tab',
            displayName: 'Alice',
          },
        })
      )
      const deniedMessage = await deniedChannel
      assert.strictEqual(deniedMessage.event, 'channel:error')
      assert.strictEqual(deniedMessage.data.event, 'channel:presence:join')
      assert.strictEqual(deniedMessage.data.channel, privateChannel)
      assert.strictEqual(deniedMessage.data.code, 'PERMISSION_ERROR')
      assert.strictEqual(deniedMessage.data.error, '未加入该频道')
      assert.deepStrictEqual(loggedErrors, [])
    } finally {
      console.error = originalError
      ws.close()
    }
  })
})
