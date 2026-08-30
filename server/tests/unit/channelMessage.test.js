import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CHANNEL_MEMBER_JOINED_EVENT,
  CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
  getChannelHistoryDedupeKey,
  isChannelHistoryEntry,
  isChannelMemberProfileEventEntry,
  normalizeChannelMentionList,
  normalizeClientMessageId,
} from '../../src/core/channelMessage.js'

const ALICE_INPUT_ADDRESS = `0x${'aB'.repeat(20)}`
const ALICE_ADDRESS = `0x${'ab'.repeat(20)}`
const BOB_INPUT_ADDRESS = `0x${'cD'.repeat(20)}`
const BOB_ADDRESS = `0x${'cd'.repeat(20)}`

describe('channel messages', () => {
  it('normalizes UUID message IDs and rejects malformed strict input', () => {
    assert.equal(
      normalizeClientMessageId('550E8400-E29B-41D4-A716-446655440000'),
      '550e8400-e29b-41d4-a716-446655440000'
    )
    assert.equal(normalizeClientMessageId('invalid'), '')
    assert.throws(
      () => normalizeClientMessageId('invalid', { strict: true }),
      /Invalid clientMessageId/
    )
  })

  it('normalizes valid ordered mentions', () => {
    assert.deepEqual(
      normalizeChannelMentionList(
        [
          { address: ALICE_INPUT_ADDRESS, label: 'Alice', start: 6, end: 12 },
          { address: BOB_INPUT_ADDRESS, label: 'Bob', start: 17, end: 21 },
        ],
        'hello @Alice and @Bob',
        { strict: true }
      ),
      [
        { address: ALICE_ADDRESS, label: 'Alice', start: 6, end: 12 },
        { address: BOB_ADDRESS, label: 'Bob', start: 17, end: 21 },
      ]
    )
  })

  it('drops invalid non-strict mentions and rejects attachment mentions', () => {
    assert.deepEqual(
      normalizeChannelMentionList(
        [{ address: ALICE_INPUT_ADDRESS, label: 'Alice', start: 0, end: 6 }],
        'hello @Alice'
      ),
      []
    )
    assert.throws(
      () =>
        normalizeChannelMentionList(
          [{ address: ALICE_INPUT_ADDRESS, label: 'Alice', start: 6, end: 12 }],
          'hello @Alice',
          { strict: true, attachment: { cid: 'cid' } }
        ),
      /attachment messages cannot include mentions/
    )
  })

  it('recognizes persisted channel history entries', () => {
    assert.equal(isChannelHistoryEntry({ type: 'message' }), true)
    assert.equal(isChannelHistoryEntry({ type: 'system' }), true)
    assert.equal(isChannelHistoryEntry({ type: 'profile' }), false)
    assert.equal(
      isChannelMemberProfileEventEntry({
        type: 'system',
        event: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
        content: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
      }),
      true
    )
  })

  it('builds stable keys for member events and regular messages', () => {
    assert.equal(
      getChannelHistoryDedupeKey({
        type: 'system',
        event: CHANNEL_MEMBER_JOINED_EVENT,
        author: ALICE_INPUT_ADDRESS,
        content: 'joined',
      }),
      `system:${CHANNEL_MEMBER_JOINED_EVENT}:${ALICE_ADDRESS}:joined`
    )
    assert.equal(
      getChannelHistoryDedupeKey({
        type: 'system',
        event: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
        content: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
        member: {
          address: BOB_INPUT_ADDRESS,
          profileUpdatedAt: 1234.9,
        },
      }),
      `system:${CHANNEL_MEMBER_PROFILE_UPDATED_EVENT}:${BOB_ADDRESS}:1234`
    )
    assert.equal(
      getChannelHistoryDedupeKey({
        _coreKey: 'core',
        type: 'message',
        author: ALICE_ADDRESS,
        timestamp: '2026-08-31T00:00:00.000Z',
        content: ' hello ',
      }),
      `core:message::${ALICE_ADDRESS}:2026-08-31T00:00:00.000Z:hello`
    )
  })
})
