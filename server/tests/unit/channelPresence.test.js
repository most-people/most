import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CHANNEL_PRESENCE_TIMEOUT_MS,
  ChannelPresenceManager,
} from '../../src/core/channelPresence.js'

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
      local: true,
      displayName: 'Alice',
      profileUpdatedAt: 1,
      lastSeen: 100,
    })
    presence.join(CHANNEL, {
      address: ALICE,
      sessionId: 'two',
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
    assert.equal(presence.listLocal().length, 1)

    presence.leave('room', { address: ALICE, sessionId: 'one' })
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
