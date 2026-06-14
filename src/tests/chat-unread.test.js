import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyIncomingChannelMessageReadState,
  getChannelActivityTime,
  getChatReadStorageKey,
  hasUnreadChannelMessage,
  initializeChannelLastReadAt,
  markChannelReadInMap,
  readStoredChannelLastReadAt,
  writeStoredChannelLastReadAt,
} from '../lib/chatUnread.js'
import {
  getChannelSubscriptionChanges,
  getChannelSubscriptionKey,
  getChannelSubscriptionNames,
} from '../lib/channelSubscriptions.js'

describe('chat unread state', () => {
  it('initializes joined channels as read at their current activity time', () => {
    const channels = [
      {
        name: 'general',
        createdAt: '2026-06-10T01:00:00.000Z',
        lastMessageAt: '2026-06-10T02:00:00.000Z',
      },
      {
        name: 'random',
        createdAt: '2026-06-10T03:00:00.000Z',
      },
    ]

    const result = initializeChannelLastReadAt({}, channels, 123)

    assert.equal(result.changed, true)
    assert.equal(result.value.general, Date.parse(channels[0].lastMessageAt))
    assert.equal(result.value.random, Date.parse(channels[1].createdAt))
    assert.equal(hasUnreadChannelMessage(channels[0], result.value), false)
    assert.equal(hasUnreadChannelMessage(channels[1], result.value), false)
  })

  it('does not move an existing channel read timestamp backwards', () => {
    const previous = { general: 5000 }
    const result = initializeChannelLastReadAt(
      previous,
      [
        {
          name: 'general',
          lastMessageAt: '2026-06-10T02:00:00.000Z',
        },
      ],
      123
    )

    assert.equal(result.changed, false)
    assert.equal(result.value, previous)
  })

  it('marks a non-active channel unread and asks for notification', () => {
    const result = applyIncomingChannelMessageReadState(
      { general: 1000 },
      {
        channelName: 'general',
        messageTime: 2000,
        activeChannelName: 'other',
        messageAuthor: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }
    )

    assert.equal(result.changed, false)
    assert.equal(result.notify, true)
    assert.deepEqual(result.value, { general: 1000 })
  })

  it('reopens unread when local read time was ahead of an incoming remote message', () => {
    const result = applyIncomingChannelMessageReadState(
      { general: 5000 },
      {
        channelName: 'general',
        messageTime: 4000,
        activeChannelName: 'other',
        messageAuthor: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }
    )

    assert.equal(result.changed, true)
    assert.equal(result.notify, true)
    assert.deepEqual(result.value, { general: 3999 })
  })

  it('keeps active-channel and self messages read', () => {
    const activeResult = applyIncomingChannelMessageReadState(
      { general: 1000 },
      {
        channelName: 'general',
        messageTime: 2000,
        activeChannelName: 'general',
        messageAuthor: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }
    )
    const selfResult = applyIncomingChannelMessageReadState(
      { random: 1000 },
      {
        channelName: 'random',
        messageTime: 3000,
        activeChannelName: 'general',
        messageAuthor: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }
    )

    assert.equal(activeResult.notify, false)
    assert.equal(activeResult.value.general, 2000)
    assert.equal(selfResult.notify, false)
    assert.equal(selfResult.value.random, 3000)
  })

  it('marks sent messages read immediately after HTTP success', () => {
    const result = markChannelReadInMap({ general: 1000 }, 'general', 2500)

    assert.equal(result.changed, true)
    assert.deepEqual(result.value, { general: 2500 })
  })

  it('detects unread by comparing channel activity and last read time', () => {
    const channel = {
      name: 'general',
      lastMessageAt: '2026-06-10T02:00:00.000Z',
    }
    const activity = getChannelActivityTime(channel)

    assert.equal(hasUnreadChannelMessage(channel, { general: activity }), false)
    assert.equal(hasUnreadChannelMessage(channel, { general: activity - 1 }), true)
  })

  it('persists last-read maps under the normalized wallet address', () => {
    const storage = new MemoryStorage()
    const storageKey = getChatReadStorageKey(
      '  0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  '
    )

    writeStoredChannelLastReadAt(storageKey, { general: 1234 }, storage)

    assert.equal(
      storageKey,
      'mostbox.chat.lastReadAt:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )
    assert.deepEqual(readStoredChannelLastReadAt(storageKey, storage), {
      general: 1234,
    })
  })
})

describe('channel subscriptions', () => {
  it('deduplicates active and extra channel subscriptions while preserving order', () => {
    assert.deepEqual(
      getChannelSubscriptionNames('general', [
        'general',
        'random',
        '',
        'dev',
        'random',
      ]),
      ['general', 'random', 'dev']
    )
  })

  it('builds a stable key for equivalent extra subscription lists', () => {
    assert.equal(
      getChannelSubscriptionKey(['general', 'random', 'general', '']),
      'general\nrandom'
    )
  })

  it('computes subscribe and unsubscribe deltas without touching retained channels', () => {
    assert.deepEqual(
      getChannelSubscriptionChanges(
        new Set(['general', 'random']),
        new Set(['random', 'dev'])
      ),
      {
        subscribe: ['dev'],
        unsubscribe: ['general'],
      }
    )
  })
})

class MemoryStorage {
  #values = new Map()

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null
  }

  setItem(key, value) {
    this.#values.set(key, String(value))
  }
}
