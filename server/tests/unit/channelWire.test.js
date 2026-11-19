import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createChannelVoiceMessage,
  normalizeRemoteChannelFrame,
} from '../../src/core/channelWire.js'

import {
  createSignedPresenceFrame,
  presenceSession,
} from '../../src/core/channelSignedPresence.js'

describe('channel wire messages', () => {
  it('forwards only signed envelope fields and sets the local receipt time', () => {
    const body = { author: 'alice', sessionId: 'one', lastSeen: 1 }
    const signed = { body, device: 'device', cert: 'cert', sig: 'signature' }
    assert.deepEqual(
      createSignedPresenceFrame({ ...signed, peerId: 'untrusted' }),
      {
        ...signed,
        v: 2,
        type: 'channel-presence',
      }
    )
    const before = Date.now()
    const session = presenceSession(body, 'stream')
    assert.equal(session.sourceId, 'stream')
    assert.ok(session.lastSeen >= before && session.lastSeen <= Date.now())
  })

  it('builds voice messages without changing event fields', () => {
    assert.deepEqual(
      createChannelVoiceMessage('local-peer', {
        channelId: 'team-room',
        event: 'heartbeat',
        sessionId: 'session-1',
      }),
      {
        type: 'channel-voice',
        peerId: 'local-peer',
        channelId: 'team-room',
        event: 'heartbeat',
        sessionId: 'session-1',
      }
    )
  })

  it('normalizes remote frame identity and rejects local echoes', () => {
    assert.deepEqual(
      normalizeRemoteChannelFrame(
        {
          type: 'channel-voice',
          peerId: ' remote-peer ',
          channelId: ' Team-Room ',
        },
        'local-peer',
        'channel-voice'
      ),
      {
        peerId: 'remote-peer',
        channelId: 'team-room',
        channelKey: 'team-room',
      }
    )
    assert.equal(
      normalizeRemoteChannelFrame(
        { type: 'channel-voice', peerId: 'local-peer' },
        'local-peer',
        'channel-voice'
      ),
      null
    )
  })
})
