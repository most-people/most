import { Buffer } from 'node:buffer'
import { ValidationError } from '../utils/errors.js'

const CURSOR_VERSION = 1
const MAX_CURSOR_LENGTH = 512

function getEntryPosition(entry) {
  return [Number(entry.timestamp) || 0, entry._coreKey, entry._index]
}

function comparePositions(left, right) {
  return (
    left[0] - right[0] ||
    (left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0) ||
    left[2] - right[2]
  )
}

function decodeCursor(cursor, channelKey) {
  try {
    if (
      typeof cursor !== 'string' ||
      !cursor ||
      cursor.length > MAX_CURSOR_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(cursor)
    ) {
      throw new Error('Invalid cursor encoding')
    }
    const bytes = Buffer.from(cursor, 'base64url')
    if (bytes.toString('base64url') !== cursor) {
      throw new Error('Invalid cursor encoding')
    }
    const value = JSON.parse(bytes.toString('utf8'))
    if (
      !Array.isArray(value) ||
      value.length !== 5 ||
      value[0] !== CURSOR_VERSION ||
      value[1] !== channelKey ||
      !Number.isFinite(value[2]) ||
      value[2] < 0 ||
      typeof value[3] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value[3]) ||
      !Number.isSafeInteger(value[4]) ||
      value[4] < 0
    ) {
      throw new Error('Invalid cursor position')
    }
    return value.slice(2)
  } catch {
    throw new ValidationError(
      'Invalid history cursor',
      'INVALID_HISTORY_CURSOR'
    )
  }
}

export function normalizeHistoryLimit(input = 50) {
  const value = Number(input)
  if (
    !['number', 'string'].includes(typeof input) ||
    (typeof input === 'string' && !/^\d+$/.test(input)) ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new ValidationError('History limit must be an integer from 1 to 100')
  }
  return value
}

export function paginateChannelHistory(entries, channelKey, options = {}) {
  const limit = normalizeHistoryLimit(options.limit)
  const before =
    options.before === undefined
      ? null
      : decodeCursor(options.before, channelKey)
  const candidates = entries
    .filter(
      entry => !before || comparePositions(getEntryPosition(entry), before) < 0
    )
    .sort((left, right) =>
      comparePositions(getEntryPosition(left), getEntryPosition(right))
    )
  const messages = candidates.slice(-limit)
  const nextCursor =
    candidates.length > messages.length
      ? Buffer.from(
          JSON.stringify([
            CURSOR_VERSION,
            channelKey,
            ...getEntryPosition(messages[0]),
          ])
        ).toString('base64url')
      : null
  return { messages, nextCursor }
}
