import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChannelVoiceEvent } from '../../src/core/channelVoice.js'

const OWNER = '0x1111111111111111111111111111111111111111'

describe('channel voice event normalization', () => {
  it('normalizes a join event with authenticated sender metadata', () => {
    const event = normalizeChannelVoiceEvent('room-168', {
      event: 'join',
      sessionId: 'voice-1700000000000-abc123',
      micMuted: true,
      displayName: 'Alice',
      avatar: '/avatars/default/mint.svg',
      profileUpdatedAt: 7,
    }, {
      ownerAddress: OWNER,
      timestamp: 1700000000000,
    })

    assert.deepStrictEqual(event, {
      channel: 'room-168',
      channelKey: 'room-168',
      channelId: 'room-168',
      event: 'join',
      sessionId: 'voice-1700000000000-abc123',
      sender: {
        address: OWNER,
        displayName: 'Alice',
        avatar: '/avatars/default/mint.svg',
        profileUpdatedAt: 7,
      },
      micMuted: true,
      timestamp: 1700000000000,
    })
  })

  it('normalizes WebRTC signal events without trusting sender address input', () => {
    const event = normalizeChannelVoiceEvent('room-168', {
      event: 'signal',
      sessionId: 'voice-local',
      targetSessionId: 'voice-remote',
      sender: {
        address: '0xffffffffffffffffffffffffffffffffffffffff',
      },
      signal: {
        type: 'candidate',
        candidate: {
          candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      },
    }, {
      ownerAddress: OWNER,
      timestamp: 1700000000100,
    })

    assert.strictEqual(event.sender.address, OWNER)
    assert.strictEqual(event.targetSessionId, 'voice-remote')
    assert.deepStrictEqual(event.signal, {
      type: 'candidate',
      candidate: {
        candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    })
  })

  it('preserves WebRTC SDP bytes including trailing line endings', () => {
    const sdp =
      'v=0\r\n' +
      'o=- 123 2 IN IP4 127.0.0.1\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'a=ssrc:1238379771 msid:50aff311-8cc3-42d8-808a-19bc1fc102d4 f70fbbf6-f775-46e4-9867-dbb69a674837\r\n'

    const event = normalizeChannelVoiceEvent('room-168', {
      event: 'signal',
      sessionId: 'voice-local',
      targetSessionId: 'voice-remote',
      signal: {
        type: 'offer',
        sdp,
      },
    }, {
      ownerAddress: OWNER,
      timestamp: 1700000000200,
    })

    assert.strictEqual(event.signal.sdp, sdp)
  })

  it('rejects unsupported events and malformed session identifiers', () => {
    assert.throws(
      () => normalizeChannelVoiceEvent('room-168', {
        event: 'invite',
        sessionId: 'voice-local',
      }, {
        ownerAddress: OWNER,
      }),
      /Invalid voice event/
    )

    assert.throws(
      () => normalizeChannelVoiceEvent('room-168', {
        event: 'join',
        sessionId: '../bad',
      }, {
        ownerAddress: OWNER,
      }),
      /Invalid voice session/
    )
  })

  it('rejects oversized signal payloads', () => {
    assert.throws(
      () => normalizeChannelVoiceEvent('room-168', {
        event: 'signal',
        sessionId: 'voice-local',
        targetSessionId: 'voice-remote',
        signal: {
          type: 'offer',
          sdp: 'x'.repeat(70000),
        },
      }, {
        ownerAddress: OWNER,
      }),
      /voice signal is too large/
    )
  })
})
