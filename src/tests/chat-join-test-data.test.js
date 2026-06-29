import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_JOIN_TEST_CHANNEL,
  CHAT_JOIN_TEST_INVITES,
  getChatJoinTestInvite,
} from '../lib/chatJoinTestData.js'

describe('chat join test data', () => {
  it('provides user and service fixtures in the same channel', () => {
    assert.deepEqual(
      CHAT_JOIN_TEST_INVITES.map(invite => invite.uid),
      ['user', 'service']
    )
    assert.deepEqual(
      CHAT_JOIN_TEST_INVITES.map(invite => invite.theme),
      ['sparkbit', undefined]
    )

    for (const invite of CHAT_JOIN_TEST_INVITES) {
      assert.ok(invite.name)
      assert.ok(invite.avatar.startsWith('data:image/svg+xml,'))
      assert.deepEqual(invite.channels, [CHAT_JOIN_TEST_CHANNEL])
    }
  })

  it('looks up fixtures by account uid', () => {
    assert.equal(getChatJoinTestInvite('user')?.name, '测试用户')
    assert.equal(getChatJoinTestInvite('service')?.name, '测试客服')
    assert.equal(getChatJoinTestInvite('missing'), null)
  })
})
