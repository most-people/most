import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyHistoricalChannelMentionUnreadState,
  applyIncomingChannelMentionUnreadState,
  applyIncomingChannelMessageReadState,
  clearChannelMentionUnreadInMap,
  getChannelActivityTime,
  getChatReadStorageKey,
  hasUnreadChannelMention,
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
import {
  dedupeChannelMessages,
  getChannelMessageKey,
} from '../lib/channelMessages.js'

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

  it('keeps active-channel messages read and asks for notification', () => {
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

    assert.equal(activeResult.notify, true)
    assert.equal(activeResult.value.general, 2000)
  })

  it('keeps self messages read without notification', () => {
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
    assert.equal(
      hasUnreadChannelMessage(channel, { general: activity - 1 }),
      true
    )
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

  it('tracks mention unread only for non-active remote messages', () => {
    const message = {
      type: 'message',
      author: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      content: 'hi @Alice',
      timestamp: 2000,
      mentions: [
        {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          label: 'Alice',
          start: 3,
          end: 9,
        },
      ],
    }

    const result = applyIncomingChannelMentionUnreadState(
      {},
      {
        channelName: 'general',
        message,
        activeChannelName: 'other',
        userAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }
    )

    assert.equal(result.changed, true)
    assert.equal(hasUnreadChannelMention({ name: 'general' }, result.value), true)

    const activeResult = applyIncomingChannelMentionUnreadState(
      result.value,
      {
        channelName: 'general',
        message,
        activeChannelName: 'general',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }
    )
    assert.equal(activeResult.changed, false)
    assert.equal(activeResult.value, result.value)
  })

  it('ignores self mention messages for mention unread', () => {
    const result = applyIncomingChannelMentionUnreadState(
      {},
      {
        channelName: 'general',
        activeChannelName: 'other',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        message: {
          author: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          content: '@Alice',
          mentions: [
            {
              address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              label: 'Alice',
              start: 0,
              end: 6,
            },
          ],
        },
      }
    )

    assert.equal(result.changed, false)
    assert.deepEqual(result.value, {})
  })

  it('restores mention unread from unread historical messages', () => {
    const result = applyHistoricalChannelMentionUnreadState(
      {},
      {
        channelName: 'general',
        lastReadAt: 1500,
        activeChannelName: 'other',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        messages: [
          {
            author: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            content: 'old @Alice',
            timestamp: 1400,
            mentions: [
              {
                address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                label: 'Alice',
                start: 4,
                end: 10,
              },
            ],
          },
          {
            author: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            content: 'new @Alice',
            timestamp: 2000,
            mentions: [
              {
                address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                label: 'Alice',
                start: 4,
                end: 10,
              },
            ],
          },
        ],
      }
    )

    assert.equal(result.changed, true)
    assert.deepEqual(result.value, { general: true })
  })

  it('does not restore historical mention unread for active or self messages', () => {
    const message = {
      author: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      content: '@Alice',
      timestamp: 2000,
      mentions: [
        {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          label: 'Alice',
          start: 0,
          end: 6,
        },
      ],
    }

    const activeResult = applyHistoricalChannelMentionUnreadState(
      {},
      {
        channelName: 'general',
        activeChannelName: 'general',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        lastReadAt: 1000,
        messages: [{ ...message, author: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
      }
    )
    const selfResult = applyHistoricalChannelMentionUnreadState(
      {},
      {
        channelName: 'general',
        activeChannelName: 'other',
        userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        lastReadAt: 1000,
        messages: [message],
      }
    )

    assert.equal(activeResult.changed, false)
    assert.deepEqual(activeResult.value, {})
    assert.equal(selfResult.changed, false)
    assert.deepEqual(selfResult.value, {})
  })

  it('clears mention unread when a channel is opened', () => {
    const result = clearChannelMentionUnreadInMap(
      { general: true, random: true },
      'general'
    )

    assert.equal(result.changed, true)
    assert.deepEqual(result.value, { random: true })
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

describe('channel message keys', () => {
  it('uses clientMessageId with author as the stable message key when present', () => {
    const key = getChannelMessageKey({
      type: 'message',
      author: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      content: 'hello',
      timestamp: 1000,
    })

    assert.equal(
      key,
      'client:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:11111111-1111-4111-8111-111111111111'
    )
  })

  it('deduplicates repeated member-joined system messages by author', () => {
    const first = getChannelMessageKey({
      type: 'system',
      event: 'channel.member.joined',
      author: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      authorName: 'Visitor',
      content: 'channel.member.joined',
      timestamp: 1000,
    })
    const second = getChannelMessageKey({
      type: 'system',
      event: 'channel.member.joined',
      author: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      authorName: 'Visitor',
      content: 'channel.member.joined',
      timestamp: 2000,
    })
    const normalMessage = getChannelMessageKey({
      type: 'message',
      author: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      content: 'channel.member.joined',
      timestamp: 2000,
    })

    assert.equal(first, second)
    assert.notEqual(first, normalMessage)
  })

  it('filters repeated member-joined messages without merging normal chat text', () => {
    const messages = dedupeChannelMessages([
      {
        type: 'system',
        event: 'channel.member.joined',
        author: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        content: 'channel.member.joined',
        timestamp: 1000,
      },
      {
        type: 'system',
        event: 'channel.member.joined',
        author: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        content: 'channel.member.joined',
        timestamp: 2000,
      },
      {
        type: 'system',
        event: 'channel.member.joined',
        author: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        authorName: 'Visitor',
        content: 'channel.member.joined',
        timestamp: 2500,
      },
      {
        type: 'message',
        author: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        content: 'hello',
        timestamp: 3000,
      },
      {
        type: 'message',
        author: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        content: 'hello',
        timestamp: 4000,
      },
    ])

    assert.deepEqual(
      messages.map(message => message.timestamp),
      [1000, 2500, 3000, 4000]
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
