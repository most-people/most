import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isChannelAllowedForConnection,
  selectChannelsForHello,
} from '../../src/core/channelHello.js'
import { MAX_CHANNEL_FRAME_BYTES } from '../../src/core/channelFrames.js'

function directChannel(index, type = 'direct') {
  const width = type === 'direct' ? 64 : 40
  const prefix = type === 'direct' ? 'direct' : 'direct-inbox'
  const channelId = `${prefix}.${index.toString(16).padStart(width, '0')}`
  return {
    channelId,
    channelKey: channelId,
    type,
    createdAt: '2026-07-22T00:00:00.000Z',
    lastMessageAt: '2026-07-22T00:00:00.000Z',
    memberAddresses: [`0x${'1'.repeat(40)}`, `0x${'2'.repeat(40)}`],
    writerCoreKeys: ['a'.repeat(64), 'b'.repeat(64)],
  }
}

describe('channel hello scoping', () => {
  it('keeps ordinary channels and rejects legacy direct channels', () => {
    const ordinary = {
      channelId: 'public-room',
      channelKey: 'public-room',
      type: 'public',
    }
    const direct = directChannel(1)
    const inbox = directChannel(2, 'direct-inbox')
    const malformedDirect = {
      channelId: 'direct.invalid',
      type: 'direct',
    }
    const disguisedDirect = {
      ...directChannel(4),
      type: 'public',
    }

    const selected = selectChannelsForHello([
      ordinary,
      direct,
      inbox,
      malformedDirect,
      disguisedDirect,
    ])

    assert.deepStrictEqual(
      selected.map(channel => channel.channelId),
      [ordinary.channelId]
    )
    assert.ok(isChannelAllowedForConnection(ordinary.channelId))
    assert.ok(!isChannelAllowedForConnection(direct.channelId))
    assert.ok(!isChannelAllowedForConnection(inbox.channelId))
  })

  it('keeps legacy direct channels out of the frame size budget', () => {
    const ordinary = {
      channelId: 'public-room',
      channelKey: 'public-room',
      type: 'public',
    }
    const channels = [
      ordinary,
      ...Array.from({ length: 1000 }, (_, index) => directChannel(index + 1)),
    ]
    const unscopedBytes = Buffer.byteLength(
      JSON.stringify({ type: 'channel-hello', channels })
    )
    const selected = selectChannelsForHello(channels)
    const scopedBytes = Buffer.byteLength(
      JSON.stringify({ type: 'channel-hello', channels: selected })
    )

    assert.ok(unscopedBytes > MAX_CHANNEL_FRAME_BYTES)
    assert.deepStrictEqual(selected, [ordinary])
    assert.ok(scopedBytes < MAX_CHANNEL_FRAME_BYTES)
  })
})
