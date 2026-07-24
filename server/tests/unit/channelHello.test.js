import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildChannelHelloMessages,
  chunkChannelScopeTopics,
  isChannelAllowedForConnection,
  normalizeChannelScopeTopics,
  selectChannelsForHello,
} from '../../src/core/channelHello.js'
import { MAX_CHANNEL_FRAME_BYTES } from '../../src/core/channelFrames.js'

function ordinaryChannel(index) {
  const channelId = index.toString(36).padStart(22, '0')
  return {
    channelId,
    channelKey: channelId,
    type: 'public',
    createdAt: '2026-07-24T00:00:00.000Z',
    lastMessageAt: '2026-07-24T00:00:00.000Z',
    memberAddresses: [`0x${'1'.repeat(40)}`],
    writerCoreKeys: ['a'.repeat(64)],
  }
}

describe('channel hello scoping', () => {
  it('selects only channels authorized for one peer stream', () => {
    const first = ordinaryChannel(1)
    const second = ordinaryChannel(2)
    const allowedChannelIds = new Set([first.channelId])

    const selected = selectChannelsForHello([first, second], allowedChannelIds)

    assert.deepStrictEqual(selected, [first])
    assert.ok(isChannelAllowedForConnection(first.channelId, allowedChannelIds))
    assert.ok(
      !isChannelAllowedForConnection(second.channelId, allowedChannelIds)
    )
  })

  it('normalizes and chunks channel scope topics', () => {
    const first = 'a'.repeat(64)
    const second = 'B'.repeat(64)
    const topics = normalizeChannelScopeTopics([
      first,
      second,
      first,
      'not-a-topic',
      '',
    ])

    assert.deepStrictEqual(topics, [first, second.toLowerCase()])
    assert.deepStrictEqual(chunkChannelScopeTopics(topics, 1), [
      [first],
      [second.toLowerCase()],
    ])
  })

  it('keeps every hello frame below the channel frame limit', () => {
    const channels = Array.from({ length: 500 }, (_, index) =>
      ordinaryChannel(index + 1)
    )
    const allowedChannelIds = new Set(
      channels.map(channel => channel.channelId)
    )
    const selected = selectChannelsForHello(channels, allowedChannelIds)
    const messages = buildChannelHelloMessages(
      {
        type: 'channel-hello',
        peerId: 'p'.repeat(64),
        authorName: 'peer',
      },
      selected,
      MAX_CHANNEL_FRAME_BYTES
    )

    assert.ok(messages.length > 1)
    assert.deepStrictEqual(
      messages.flatMap(message => message.channels),
      channels
    )
    for (const message of messages) {
      assert.ok(
        Buffer.byteLength(JSON.stringify(message)) <= MAX_CHANNEL_FRAME_BYTES
      )
    }
  })
})
