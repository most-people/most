import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeHistoryLimit,
  paginateChannelHistory,
} from '../../src/core/channelHistory.js'

const channel = 'popper-history'
const entries = [
  { content: 'a0', timestamp: 100, _coreKey: 'a'.repeat(64), _index: 0 },
  { content: 'a1', timestamp: 100, _coreKey: 'a'.repeat(64), _index: 1 },
  { content: 'b0', timestamp: 100, _coreKey: 'b'.repeat(64), _index: 0 },
  { content: 'newer', timestamp: 101, _coreKey: 'a'.repeat(64), _index: 2 },
]

describe('channel history cursor', () => {
  it('pages tied timestamps across writers without repeats or skips', () => {
    const first = paginateChannelHistory([...entries].reverse(), channel, {
      limit: 2,
    })
    assert.deepEqual(
      first.messages.map(entry => entry.content),
      ['b0', 'newer']
    )
    assert.equal(typeof first.nextCursor, 'string')
    const second = paginateChannelHistory(
      [
        ...entries,
        {
          content: 'latest',
          timestamp: 102,
          _coreKey: 'b'.repeat(64),
          _index: 1,
        },
      ],
      channel,
      { limit: 2, before: first.nextCursor }
    )
    assert.deepEqual(
      second.messages.map(entry => entry.content),
      ['a0', 'a1']
    )
    assert.equal(second.nextCursor, null)
  })

  it('rejects malformed cursors and a cursor from another channel', () => {
    const first = paginateChannelHistory(entries, channel, { limit: 1 })
    for (const before of ['', 'not-a-cursor', first.nextCursor + '=', 123]) {
      assert.throws(
        () => paginateChannelHistory(entries, channel, { before }),
        error => error.errorCode === 'INVALID_HISTORY_CURSOR'
      )
    }
    assert.throws(
      () =>
        paginateChannelHistory(entries, 'another-room', {
          before: first.nextCursor,
        }),
      error => error.errorCode === 'INVALID_HISTORY_CURSOR'
    )
  })

  it('validates the page size and returns an empty terminal page', () => {
    assert.equal(normalizeHistoryLimit(), 50)
    assert.equal(normalizeHistoryLimit('100'), 100)
    for (const value of [0, 101, -1, 1.5, '2x', '', null]) {
      assert.throws(() => normalizeHistoryLimit(value), /History limit/)
    }
    assert.deepEqual(paginateChannelHistory([], channel), {
      messages: [],
      nextCursor: null,
    })
  })
})
