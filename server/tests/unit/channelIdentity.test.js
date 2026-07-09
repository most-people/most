import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { isSpecialChannel } from '../../src/core/channelIdentity.js'

describe('channel identity helpers', () => {
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
