import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildVoiceEventFrame,
  createVoiceRoomState,
  parseVoiceWebSocketMessage,
  reduceVoiceEvent,
  VoiceWebSocketSession,
  type VoiceSocket,
} from './voiceProtocol'

test('builds and parses a voice join frame', () => {
  const frame = buildVoiceEventFrame('room', 'join', {
    sessionId: 'voice-local',
    profile: { displayName: 'Alice' },
    micMuted: false,
  })
  const parsed = parseVoiceWebSocketMessage(frame)
  assert.ok(parsed)
  assert.equal(parsed.channel, 'room')
  assert.equal(parsed.event, 'join')
  assert.equal(parsed.sessionId, 'voice-local')
  assert.equal(parsed.micMuted, false)
  assert.equal(typeof parsed.timestamp, 'number')
})

test('normalizes server sender and applies room state updates', () => {
  const state = createVoiceRoomState('room')
  const event = parseVoiceWebSocketMessage(
    JSON.stringify({
      event: 'channel:voice',
      data: {
        channelKey: 'room',
        event: 'join',
        sessionId: 'voice-remote',
        sender: { address: 'a1', displayName: 'Bob' },
        timestamp: 10,
      },
    })
  )
  assert.ok(event)
  const joined = reduceVoiceEvent(state, event, 'voice-local')
  assert.equal(joined.participants['voice-remote']?.displayName, 'Bob')
  const muted = reduceVoiceEvent(
    joined,
    { ...event, event: 'state', micMuted: true, timestamp: 20 },
    'voice-local'
  )
  assert.equal(muted.participants['voice-remote']?.micMuted, true)
  const left = reduceVoiceEvent(
    muted,
    { ...event, event: 'leave', timestamp: 30 },
    'voice-local'
  )
  assert.equal(left.participants['voice-remote'], undefined)
})

test('voice session subscribes, joins, updates state and leaves', async () => {
  class FakeSocket implements VoiceSocket {
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
  }

  const socket = new FakeSocket()
  const session = new VoiceWebSocketSession({
    baseUrl: 'https://node.example',
    invite: 'invite',
    identity: null,
    channel: 'room',
    sessionId: 'voice-local',
    webSocketFactory: () => socket,
  })
  const joining = session.join()
  await new Promise(resolve => setTimeout(resolve, 0))
  socket.open()
  await joining
  session.setMuted(true)
  session.heartbeat()
  session.sendSignal('voice-remote', { type: 'offer', sdp: 'v=0' })
  session.leave()
  const frames = socket.sent.map(value => JSON.parse(value))
  assert.equal(frames[0].event, 'channel:subscribe')
  assert.deepEqual(
    frames.slice(1).map(frame => frame.event),
    [
      'channel:voice:join',
      'channel:voice:state',
      'channel:voice:heartbeat',
      'channel:voice:signal',
      'channel:voice:leave',
    ]
  )
  session.close()
})
