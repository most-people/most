import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'

describe('Call Signaling', () => {
  let callClients
  let activeCalls
  let channelCalls
  let ws1, ws2, ws3

  function createMockWs() {
    return {
      readyState: 1,
      sent: [],
      send(data) { this.sent.push(data) },
      on() {}
    }
  }

  function registerCallClient(ws, peerId) {
    if (!callClients.has(ws)) {
      callClients.set(ws, { peerId, calls: new Map() })
    } else {
      callClients.get(ws).peerId = peerId
    }
  }

  function sendToWs(ws, event, data) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ event, data })) } catch {}
    }
  }

  function broadcastToChannelCall(channelName, event, data) {
    const callData = channelCalls.get(channelName)
    if (!callData) return
    const payload = JSON.stringify({ event, data })
    for (const ws of callData.peers) {
      if (ws.readyState === 1) {
        try { ws.send(payload) } catch {}
      }
    }
  }

  function handleChannelCallJoin(ws, { channel }) {
    const clientInfo = callClients.get(ws)
    if (!clientInfo) return { error: 'not_registered' }
    if (!channelCalls.has(channel)) {
      channelCalls.set(channel, { peers: new Set(), createdAt: Date.now() })
    }
    const callData = channelCalls.get(channel)
    callData.peers.add(ws)
    const peerList = []
    for (const peerWs of callData.peers) {
      const info = callClients.get(peerWs)
      if (info && peerWs !== ws) {
        peerList.push({ peerId: info.peerId })
        sendToWs(peerWs, 'call:peer-joined', { peerId: clientInfo.peerId, channel })
      }
    }
    broadcastToChannelCall(channel, 'call:peer-joined', { peerId: clientInfo.peerId, channel })
    return { channel, peers: peerList }
  }

  function handleChannelCallLeave(ws, { channel }) {
    const callData = channelCalls.get(channel)
    if (!callData) return
    callData.peers.delete(ws)
    const clientInfo = callClients.get(ws)
    broadcastToChannelCall(channel, 'call:peer-left', { peerId: clientInfo?.peerId, channel })
    if (callData.peers.size === 0) {
      channelCalls.delete(channel)
    }
  }

  function handleChannelCallSignal(ws, { channel, signalData, targetPeerId }) {
    const callData = channelCalls.get(channel)
    if (!callData) return
    for (const peerWs of callData.peers) {
      const info = callClients.get(peerWs)
      if (info && info.peerId === targetPeerId) {
        sendToWs(peerWs, 'signal', { channel, signalData, fromPeerId: callClients.get(ws)?.peerId })
        break
      }
    }
  }

  function handleChannelCallChat(ws, { channel, message }) {
    const clientInfo = callClients.get(ws)
    broadcastToChannelCall(channel, 'call:chat', { from: clientInfo?.peerId || 'unknown', message, channel })
  }

  function handleChannelCallPresenterChange(ws, { channel, presenterPeerId }) {
    broadcastToChannelCall(channel, 'call:presenter-change', { presenterPeerId, channel })
  }

  beforeEach(() => {
    callClients = new Map()
    activeCalls = new Map()
    channelCalls = new Map()
    ws1 = createMockWs()
    ws2 = createMockWs()
    ws3 = createMockWs()
  })

  describe('registerCallClient', () => {
    it('registers a new client with peerId', () => {
      registerCallClient(ws1, 'peer-a')
      assert.strictEqual(callClients.has(ws1), true)
      assert.strictEqual(callClients.get(ws1).peerId, 'peer-a')
    })

    it('updates peerId for existing client', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws1, 'peer-b')
      assert.strictEqual(callClients.get(ws1).peerId, 'peer-b')
    })
  })

  describe('handleChannelCallJoin', () => {
    it('returns error if client not registered', () => {
      const result = handleChannelCallJoin(ws1, { channel: 'test' })
      assert.deepStrictEqual(result, { error: 'not_registered' })
    })

    it('creates a new channel call if it does not exist', () => {
      registerCallClient(ws1, 'peer-a')
      const result = handleChannelCallJoin(ws1, { channel: 'test' })
      assert.strictEqual(result.channel, 'test')
      assert.deepStrictEqual(result.peers, [])
      assert.strictEqual(channelCalls.has('test'), true)
    })

    it('adds peer to existing channel call', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      const result = handleChannelCallJoin(ws2, { channel: 'test' })
      assert.strictEqual(result.channel, 'test')
      assert.strictEqual(result.peers.length, 1)
      assert.strictEqual(result.peers[0].peerId, 'peer-a')
    })

    it('notifies existing peers when new peer joins', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      ws1.sent = []
      ws2.sent = []
      handleChannelCallJoin(ws2, { channel: 'test' })
      const ws1Msgs = ws1.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws1Msgs.some(m => m.event === 'call:peer-joined'), true)
      assert.strictEqual(ws1Msgs.find(m => m.event === 'call:peer-joined').data.peerId, 'peer-b')
    })

    it('returns self as peer for the joining client', () => {
      registerCallClient(ws1, 'peer-a')
      const result = handleChannelCallJoin(ws1, { channel: 'test' })
      assert.deepStrictEqual(result.peers, [])
    })

    it('allows same peer to join multiple channels', () => {
      registerCallClient(ws1, 'peer-a')
      handleChannelCallJoin(ws1, { channel: 'channel-a' })
      handleChannelCallJoin(ws1, { channel: 'channel-b' })
      assert.strictEqual(channelCalls.has('channel-a'), true)
      assert.strictEqual(channelCalls.has('channel-b'), true)
    })
  })

  describe('handleChannelCallLeave', () => {
    it('does nothing if channel does not exist', () => {
      registerCallClient(ws1, 'peer-a')
      handleChannelCallLeave(ws1, { channel: 'nonexistent' })
      assert.strictEqual(channelCalls.has('nonexistent'), false)
    })

    it('removes peer from channel', () => {
      registerCallClient(ws1, 'peer-a')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallLeave(ws1, { channel: 'test' })
      assert.strictEqual(channelCalls.has('test'), false)
    })

    it('deletes channel when last peer leaves', () => {
      registerCallClient(ws1, 'peer-a')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallLeave(ws1, { channel: 'test' })
      assert.strictEqual(channelCalls.has('test'), false)
    })

    it('notifies remaining peers when someone leaves', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      ws1.sent = []
      handleChannelCallLeave(ws2, { channel: 'test' })
      const ws1Msgs = ws1.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws1Msgs.some(m => m.event === 'call:peer-left'), true)
      assert.strictEqual(ws1Msgs.find(m => m.event === 'call:peer-left').data.peerId, 'peer-b')
    })
  })

  describe('handleChannelCallSignal', () => {
    it('does nothing if channel does not exist', () => {
      registerCallClient(ws1, 'peer-a')
      handleChannelCallSignal(ws1, { channel: 'nonexistent', signalData: {}, targetPeerId: 'peer-b' })
      assert.strictEqual(ws2.sent.length, 0)
    })

    it('forwards signal to target peer', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      ws2.sent = []
      handleChannelCallSignal(ws1, { channel: 'test', signalData: { type: 'offer' }, targetPeerId: 'peer-b' })
      const ws2Msgs = ws2.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws2Msgs.some(m => m.event === 'signal'), true)
      assert.deepStrictEqual(ws2Msgs.find(m => m.event === 'signal').data.signalData, { type: 'offer' })
    })

    it('includes fromPeerId in signal', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      ws2.sent = []
      handleChannelCallSignal(ws1, { channel: 'test', signalData: {}, targetPeerId: 'peer-b' })
      const ws2Msgs = ws2.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws2Msgs.find(m => m.event === 'signal').data.fromPeerId, 'peer-a')
    })

    it('does not send signal to non-target peers', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      registerCallClient(ws3, 'peer-c')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      handleChannelCallJoin(ws3, { channel: 'test' })
      ws2.sent = []
      ws3.sent = []
      handleChannelCallSignal(ws1, { channel: 'test', signalData: {}, targetPeerId: 'peer-b' })
      assert.strictEqual(ws2.sent.length, 1)
      assert.strictEqual(ws3.sent.length, 0)
    })
  })

  describe('handleChannelCallChat', () => {
    it('broadcasts chat message to all peers in channel', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      ws1.sent = []
      ws2.sent = []
      handleChannelCallChat(ws1, { channel: 'test', message: 'hello' })
      const ws1Msgs = ws1.sent.map(s => JSON.parse(s))
      const ws2Msgs = ws2.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws1Msgs.some(m => m.event === 'call:chat'), true)
      assert.strictEqual(ws2Msgs.some(m => m.event === 'call:chat'), true)
      assert.strictEqual(ws1Msgs.find(m => m.event === 'call:chat').data.from, 'peer-a')
      assert.strictEqual(ws1Msgs.find(m => m.event === 'call:chat').data.message, 'hello')
    })

    it('uses unknown for unregistered client', () => {
      registerCallClient(ws1, 'peer-a')
      handleChannelCallJoin(ws1, { channel: 'test' })
      ws1.sent = []
      handleChannelCallChat(ws1, { channel: 'test', message: 'hello' })
      const ws1Msgs = ws1.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws1Msgs.find(m => m.event === 'call:chat').data.from, 'peer-a')
    })
  })

  describe('handleChannelCallPresenterChange', () => {
    it('broadcasts presenter change to all peers', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      ws1.sent = []
      ws2.sent = []
      handleChannelCallPresenterChange(ws1, { channel: 'test', presenterPeerId: 'peer-b' })
      const ws1Msgs = ws1.sent.map(s => JSON.parse(s))
      const ws2Msgs = ws2.sent.map(s => JSON.parse(s))
      assert.strictEqual(ws1Msgs.some(m => m.event === 'call:presenter-change'), true)
      assert.strictEqual(ws2Msgs.some(m => m.event === 'call:presenter-change'), true)
      assert.strictEqual(ws1Msgs.find(m => m.event === 'call:presenter-change').data.presenterPeerId, 'peer-b')
    })
  })

  describe('Multi-peer scenario', () => {
    it('handles 3 peers joining and leaving correctly', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')
      registerCallClient(ws3, 'peer-c')

      handleChannelCallJoin(ws1, { channel: 'test' })
      handleChannelCallJoin(ws2, { channel: 'test' })
      handleChannelCallJoin(ws3, { channel: 'test' })

      assert.strictEqual(channelCalls.get('test').peers.size, 3)

      handleChannelCallLeave(ws2, { channel: 'test' })
      assert.strictEqual(channelCalls.get('test').peers.size, 2)
      assert.strictEqual(channelCalls.get('test').peers.has(ws2), false)

      handleChannelCallLeave(ws1, { channel: 'test' })
      assert.strictEqual(channelCalls.get('test').peers.size, 1)

      handleChannelCallLeave(ws3, { channel: 'test' })
      assert.strictEqual(channelCalls.has('test'), false)
    })

    it('isolates different channels', () => {
      registerCallClient(ws1, 'peer-a')
      registerCallClient(ws2, 'peer-b')

      handleChannelCallJoin(ws1, { channel: 'channel-a' })
      handleChannelCallJoin(ws2, { channel: 'channel-b' })

      assert.strictEqual(channelCalls.get('channel-a').peers.size, 1)
      assert.strictEqual(channelCalls.get('channel-b').peers.size, 1)
      assert.strictEqual(channelCalls.get('channel-a').peers.has(ws1), true)
      assert.strictEqual(channelCalls.get('channel-b').peers.has(ws2), true)
    })
  })
})
