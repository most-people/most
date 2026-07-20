export const MAX_CHANNEL_FRAME_BYTES = 128 * 1024

function frameTooLargeError(maxFrameBytes) {
  const error = new RangeError(
    `Channel frame exceeds the ${maxFrameBytes} byte limit`
  )
  error.code = 'CHANNEL_FRAME_TOO_LARGE'
  return error
}

export function consumeChannelFrames(
  remainder,
  chunk,
  maxFrameBytes = MAX_CHANNEL_FRAME_BYTES
) {
  let pending = Buffer.isBuffer(remainder)
    ? remainder
    : Buffer.from(remainder || '')
  const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  const frames = []
  let offset = 0

  while (offset < input.length) {
    const newlineIndex = input.indexOf(0x0a, offset)
    if (newlineIndex === -1) break

    const segment = input.subarray(offset, newlineIndex)
    if (pending.length + segment.length > maxFrameBytes) {
      throw frameTooLargeError(maxFrameBytes)
    }
    const frame = pending.length
      ? Buffer.concat([pending, segment], pending.length + segment.length)
      : segment
    frames.push(frame.toString('utf8').trim())
    pending = Buffer.alloc(0)
    offset = newlineIndex + 1
  }

  const tail = input.subarray(offset)
  if (pending.length + tail.length > maxFrameBytes) {
    throw frameTooLargeError(maxFrameBytes)
  }

  return {
    frames,
    remainder: pending.length
      ? Buffer.concat([pending, tail], pending.length + tail.length)
      : Buffer.from(tail),
  }
}
