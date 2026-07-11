import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  consumeChannelFrames,
  MAX_CHANNEL_FRAME_BYTES,
} from '../../src/core/channelFrames.js'

describe('channel frame decoding', () => {
  it('decodes complete frames and keeps a partial frame', () => {
    const result = consumeChannelFrames(
      Buffer.alloc(0),
      Buffer.from('{"one":1}\n{"two":')
    )

    assert.deepStrictEqual(result.frames, ['{"one":1}'])
    assert.deepStrictEqual(result.remainder, Buffer.from('{"two":'))
  })

  it('preserves UTF-8 characters split across chunks', () => {
    const encoded = Buffer.from('{"message":"你好"}\n')
    const splitAt = encoded.indexOf(Buffer.from('你')) + 1
    const first = consumeChannelFrames(
      Buffer.alloc(0),
      encoded.subarray(0, splitAt)
    )
    const second = consumeChannelFrames(
      first.remainder,
      encoded.subarray(splitAt)
    )

    assert.deepStrictEqual(first.frames, [])
    assert.deepStrictEqual(second.frames, ['{"message":"你好"}'])
    assert.strictEqual(second.remainder.length, 0)
  })

  it('rejects an unterminated frame above the byte limit', () => {
    assert.throws(
      () =>
        consumeChannelFrames(
          Buffer.alloc(0),
          Buffer.alloc(MAX_CHANNEL_FRAME_BYTES + 1, 0x61)
        ),
      error => error.code === 'CHANNEL_FRAME_TOO_LARGE'
    )
  })

  it('rejects an oversized frame even when it ends with a newline', () => {
    assert.throws(
      () =>
        consumeChannelFrames(
          Buffer.alloc(MAX_CHANNEL_FRAME_BYTES, 0x61),
          Buffer.from('b\n')
        ),
      error => error.code === 'CHANNEL_FRAME_TOO_LARGE'
    )
  })
})
