import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChannelKey,
  isSpecialChannel,
  normalizeChannelId,
  normalizeChannelKey,
} from '../../src/core/channelIdentity.js'

describe('channel identity helpers', () => {
  it('canonicalizes channel IDs and keys to lowercase', () => {
    assert.strictEqual(normalizeChannelId(' Chat_Room-01 '), 'chat_room-01')
    assert.strictEqual(normalizeChannelKey(' CHAT_ROOM-01 '), 'chat_room-01')
    assert.strictEqual(buildChannelKey('Chat_Room-01'), 'chat_room-01')
  })

  it('treats any dotted channel identifier as special', () => {
    assert.strictEqual(isSpecialChannel({ name: 'game.gandengyan.abcd' }), true)
    assert.strictEqual(
      isSpecialChannel({ channelId: 'user.sync.abcdef' }),
      true
    )
    assert.strictEqual(
      isSpecialChannel({ channelKey: 'system.namespace.channel' }),
      true
    )
    assert.strictEqual(isSpecialChannel({ name: 'chat-room' }), false)
  })
})
