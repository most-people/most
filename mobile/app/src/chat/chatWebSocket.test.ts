import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatWebSocketSession, type ChatSocket } from './chatWebSocket'

class FakeSocket implements ChatSocket {
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  open() {
    this.readyState = 1
    this.onopen?.()
  }

  message(data: unknown) {
    this.onmessage?.({ data })
  }
}

test('connects, subscribes and parses channel events', async () => {
  const socket = new FakeSocket()
  const events: unknown[] = []
  const session = new ChatWebSocketSession({
    baseUrl: 'https://node.example/base',
    invite: 'invite',
    identity: null,
    onEvent: event => events.push(event),
    webSocketFactory: () => socket,
  })
  const connecting = session.connect()
  await new Promise(resolve => setTimeout(resolve, 0))
  socket.open()
  await connecting
  await session.subscribe('room')
  assert.deepEqual(JSON.parse(socket.sent.at(-1) || ''), {
    event: 'channel:subscribe',
    data: { channel: 'room' },
  })
  socket.message(
    JSON.stringify({ event: 'channel:subscribed', data: { channel: 'room' } })
  )
  assert.deepEqual(events, [{ event: 'channel:subscribed', channel: 'room' }])
  session.unsubscribe('room')
  assert.deepEqual(JSON.parse(socket.sent.at(-1) || ''), {
    event: 'channel:unsubscribe',
    data: { channel: 'room' },
  })
  session.close()
})

test('reconnects with backoff and replays subscriptions', async () => {
  const sockets: FakeSocket[] = []
  const session = new ChatWebSocketSession({
    baseUrl: 'https://node.example',
    invite: 'invite',
    identity: null,
    reconnectBaseDelayMs: 1,
    reconnectMaxDelayMs: 2,
    webSocketFactory: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
  })
  const first = session.connect()
  await new Promise(resolve => setTimeout(resolve, 0))
  sockets[0].open()
  await first
  await session.subscribe('room')
  sockets[0].close()
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(sockets.length, 2)
  sockets[1].open()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), {
    event: 'channel:subscribe',
    data: { channel: 'room' },
  })
  session.close()
})

test('rejects empty channel names', async () => {
  const session = new ChatWebSocketSession({
    baseUrl: 'https://node.example',
    invite: '',
    identity: null,
    webSocketFactory: () => new FakeSocket(),
  })
  await assert.rejects(() => session.subscribe('  '), /channel is required/)
  session.close()
})
