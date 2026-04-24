import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { WebSocketServer, WebSocket } from 'ws'
import { createApp } from '../../index.js'
import { MostBoxEngine } from '../../src/index.js'

const TEST_PORT = 19772
const baseUrl = 'http://localhost:' + TEST_PORT
const wsUrl = 'ws://localhost:' + TEST_PORT + '/ws'

describe('WebSocket (integration)', { timeout: 30000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-ws-test-'))
  let serverInstance
  let wss
  let engine
  let wsBroadcast
  let wsSendToChannel
  let subscribeToChannel
  let unsubscribeFromChannel
  let cleanupWsSubscriptions

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
    const { app } = result
    wsBroadcast = result.wsBroadcast
    wsSendToChannel = result.wsSendToChannel
    subscribeToChannel = result.subscribeToChannel
    unsubscribeFromChannel = result.unsubscribeFromChannel
    cleanupWsSubscriptions = result.cleanupWsSubscriptions

    serverInstance = serve({
      fetch: app.fetch,
      port: TEST_PORT,
      hostname: 'localhost',
    })

    wss = new WebSocketServer({ noServer: true })
    wss.on('connection', ws => {
      ws.on('error', () => {})
      ws.on('close', () => {
        cleanupWsSubscriptions(ws)
      })
      ws.on('message', raw => {
        try {
          const msg = JSON.parse(raw)
          const { event, data } = msg
          switch (event) {
            case 'register':
              ws.peerId = data.peerId
              break
            case 'channel:subscribe':
              if (data.channel) subscribeToChannel(ws, data.channel)
              break
            case 'channel:unsubscribe':
              if (data.channel) unsubscribeFromChannel(ws, data.channel)
              break
          }
        } catch {}
      })
    })

    serverInstance.on('upgrade', (req, socket, head) => {
      if (req.url.startsWith('/ws')) {
        wss.handleUpgrade(req, socket, head, ws => {
          wss.emit('connection', ws, req)
        })
      } else {
        socket.destroy()
      }
    })

    wssRef.current = wss

    engine.on('download:progress', data =>
      wsBroadcast('download:progress', data)
    )
    engine.on('download:status', data => wsBroadcast('download:status', data))
    engine.on('download:success', data => wsBroadcast('download:success', data))
    engine.on('download:cancelled', data =>
      wsBroadcast('download:cancelled', data)
    )
    engine.on('publish:progress', data => wsBroadcast('publish:progress', data))
    engine.on('publish:success', data => wsBroadcast('publish:success', data))
    engine.on('connection', () =>
      wsBroadcast('network:status', engine.getNetworkStatus())
    )
    engine.on('channel:message', data =>
      wsSendToChannel(data.channel, 'channel:message', data)
    )
    engine.on('channel:peer:online', data =>
      wsBroadcast('channel:peer:online', data)
    )
    engine.on('channel:peer:offline', data =>
      wsBroadcast('channel:peer:offline', data)
    )
    engine.on('channel:joined', data => wsBroadcast('channel:joined', data))
    engine.on('channel:left', data => wsBroadcast('channel:left', data))

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

  describe('wsBroadcast', () => {
    it('broadcasts to all connected clients', async () => {
      const ws1 = await connectClient()
      const ws2 = await connectClient()

      const p1 = waitForMessage(ws1)
      const p2 = waitForMessage(ws2)

      wsBroadcast('test:event', { value: 42 })

      const msg1 = await p1
      const msg2 = await p2

      assert.deepStrictEqual(msg1, { event: 'test:event', data: { value: 42 } })
      assert.deepStrictEqual(msg2, { event: 'test:event', data: { value: 42 } })

      ws1.close()
      ws2.close()
    })

    it('does not broadcast to disconnected clients', async () => {
      const ws1 = await connectClient()
      const ws2 = await connectClient()

      ws1.close()
      await new Promise(r => setTimeout(r, 50))

      const p2 = waitForMessage(ws2)

      wsBroadcast('test:event', { value: 1 })

      const msg2 = await p2
      assert.deepStrictEqual(msg2, { event: 'test:event', data: { value: 1 } })

      ws2.close()
    })
  })

  describe('channel subscriptions', () => {
    it('sends messages only to channel subscribers', async () => {
      const wsA = await connectClient()
      const wsB = await connectClient()
      const wsC = await connectClient()

      wsA.send(
        JSON.stringify({ event: 'channel:subscribe', data: { channel: 'ch1' } })
      )
      wsB.send(
        JSON.stringify({ event: 'channel:subscribe', data: { channel: 'ch1' } })
      )
      wsC.send(
        JSON.stringify({ event: 'channel:subscribe', data: { channel: 'ch2' } })
      )

      await new Promise(r => setTimeout(r, 50))

      const pA = waitForMessage(wsA, 2000)
      const pB = waitForMessage(wsB, 2000)

      wsSendToChannel('ch1', 'channel:message', { content: 'hello' })

      const msgA = await pA
      const msgB = await pB

      assert.strictEqual(msgA.data.content, 'hello')
      assert.strictEqual(msgB.data.content, 'hello')

      let msgCReceived = false
      wsC.once('message', () => {
        msgCReceived = true
      })
      await new Promise(r => setTimeout(r, 200))
      assert.strictEqual(msgCReceived, false)

      wsA.close()
      wsB.close()
      wsC.close()
    })

    it('unsubscribes from channel', async () => {
      const ws = await connectClient()

      ws.send(
        JSON.stringify({
          event: 'channel:subscribe',
          data: { channel: 'ch-unsub' },
        })
      )
      await new Promise(r => setTimeout(r, 50))

      ws.send(
        JSON.stringify({
          event: 'channel:unsubscribe',
          data: { channel: 'ch-unsub' },
        })
      )
      await new Promise(r => setTimeout(r, 50))

      let received = false
      ws.once('message', () => {
        received = true
      })

      wsSendToChannel('ch-unsub', 'channel:message', {
        content: 'should not arrive',
      })

      await new Promise(r => setTimeout(r, 200))
      assert.strictEqual(received, false)

      ws.close()
    })

    it('cleans up subscriptions on disconnect', async () => {
      const ws = await connectClient()

      ws.send(
        JSON.stringify({
          event: 'channel:subscribe',
          data: { channel: 'ch-cleanup' },
        })
      )
      await new Promise(r => setTimeout(r, 50))

      ws.close()
      await new Promise(r => setTimeout(r, 100))

      wsSendToChannel('ch-cleanup', 'channel:message', {
        content: 'no one should get this',
      })

      await new Promise(r => setTimeout(r, 200))
    })
  })

  describe('engine events broadcast via WebSocket', () => {
    it('receives publish:success event', async () => {
      const ws = await connectClient()

      let wsMessageReceived = null
      ws.on('message', data => {
        wsMessageReceived = JSON.parse(data.toString())
      })

      await engine.publishFile(Buffer.from('ws-publish-test2'), 'ws-test2.txt')

      await new Promise(r => setTimeout(r, 500))

      assert.ok(wsMessageReceived, 'Should have received a WS message')
      assert.strictEqual(wsMessageReceived.event, 'publish:success')
      assert.strictEqual(wsMessageReceived.data.fileName, 'ws-test2.txt')

      ws.close()
    })
  })
})
