import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CHANNEL_PRESENCE_TIMEOUT_MS,
  ChannelPresenceManager,
} from '../../src/core/channelPresence.js'

import {
  createSignedPresenceFrame,
  presenceSession,
} from '../../src/core/channelSignedPresence.js'

const ALICE = `0x${'ab'.repeat(20)}`
const CHANNEL = { channelKey: 'room', channelId: 'room' }

describe('channel presence manager', () => {
  it('tracks multiple sessions and emits lifecycle changes', () => {
    const events = []
    const presence = new ChannelPresenceManager({
      emitPresence: event => events.push(event),
      getChannelId: channelKey => `id:${channelKey}`,
    })

    presence.join(CHANNEL, {
      address: ALICE,
      sessionId: 'one',
      frame: { id: 1 },
      local: true,
      displayName: 'Alice',
      profileUpdatedAt: 1,
      lastSeen: 100,
    })
    presence.join(CHANNEL, {
      address: ALICE,
      sessionId: 'two',
      frame: { id: 2 },
      local: true,
      displayName: 'Alice new',
      profileUpdatedAt: 2,
      lastSeen: 200,
    })

    assert.deepEqual(
      presence.list('room').map(entry => ({
        channelId: entry.channelId,
        displayName: entry.displayName,
        lastSeen: entry.lastSeen,
      })),
      [{ channelId: 'id:room', displayName: 'Alice new', lastSeen: 200 }]
    )
    assert.deepEqual(presence.localFrames(), [{ id: 1 }, { id: 2 }])

    presence.leave('room', { address: ALICE, sessionId: 'one' })
    assert.deepEqual(presence.localFrames(), [{ id: 2 }])
    assert.equal(presence.list('room').length, 1)
    presence.leave('room', { address: ALICE, sessionId: 'two' })
    assert.equal(presence.list('room').length, 0)
    assert.deepEqual(
      events.map(event => event.status),
      ['online', 'profile', 'offline']
    )
  })

  it('expires stale sessions and clears remote sources', () => {
    const presence = new ChannelPresenceManager()
    presence.join(CHANNEL, {
      address: ALICE,
      sourcePeerId: 'remote',
      lastSeen: 100,
    })
    assert.equal(presence.prune(100 + CHANNEL_PRESENCE_TIMEOUT_MS).length, 0)
    assert.equal(
      presence.prune(100 + CHANNEL_PRESENCE_TIMEOUT_MS + 1).length,
      1
    )

    presence.join(CHANNEL, {
      address: ALICE,
      sourcePeerId: 'remote',
      lastSeen: 200,
    })
    assert.equal(presence.clearSource('peer:remote').length, 1)
    assert.equal(presence.list('room').length, 0)
  })
})

describe('signed presence wire messages', () => {
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
})
