import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createChannelPresenceMessage,
  createChannelVoiceMessage,
  normalizeRemoteChannelFrame,
  normalizeRemoteChannelPresence,
} from '../../src/core/channelWire.js'

const ALICE_INPUT_ADDRESS = `0x${'aB'.repeat(20)}`
const ALICE_ADDRESS = `0x${'ab'.repeat(20)}`

describe('channel wire messages', () => {
  it('builds presence messages with stable defaults', () => {
    assert.deepEqual(
      createChannelPresenceMessage(
        'local-peer',
        {
          channelId: 'team-room',
          channelKey: 'team-room',
          address: ALICE_ADDRESS,
          status: 'online',
          displayName: 'Alice',
        },
        1234
      ),
      {
        type: 'channel-presence',
        peerId: 'local-peer',
        channelId: 'team-room',
        channelKey: 'team-room',
        address: ALICE_ADDRESS,
        status: 'online',
        displayName: 'Alice',
        avatar: undefined,
        profileUpdatedAt: undefined,
        lastSeen: 1234,
        sessionId: 'default',
      }
    )
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

  it('normalizes remote presence fields and rejects unknown statuses', () => {
    assert.deepEqual(
      normalizeRemoteChannelPresence(
        {
          type: 'channel-presence',
          peerId: 'remote-peer',
          channelId: 'Team-Room',
          address: ALICE_INPUT_ADDRESS,
          status: 'heartbeat',
          sessionId: 'session-1',
          lastSeen: '200',
        },
        'local-peer',
        1234
      ),
      {
        peerId: 'remote-peer',
        channelId: 'team-room',
        channelKey: 'team-room',
        status: 'heartbeat',
        options: {
          address: ALICE_ADDRESS,
          sessionId: 'session-1',
          sourcePeerId: 'remote-peer',
          local: false,
          displayName: undefined,
          avatar: undefined,
          profileUpdatedAt: undefined,
          lastSeen: 200,
        },
      }
    )
    assert.equal(
      normalizeRemoteChannelPresence(
        {
          type: 'channel-presence',
          peerId: 'remote-peer',
          channelId: 'team-room',
          address: ALICE_ADDRESS,
          status: 'unknown',
        },
        'local-peer'
      ),
      null
    )
  })
})
