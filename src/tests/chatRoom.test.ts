import { describe, expect, it } from 'vitest'

import {
  CHANNEL_ID_MAX_LENGTH,
  CHANNEL_ID_MIN_LENGTH,
  CHANNEL_ID_REGEX,
  buildChatSharePath,
  buildChatShareUrl,
  createRandomChannelId,
  getChannelIdFromHash,
  normalizeChatChannelId,
  parseChatChannelInput,
} from '~/lib/chatRoom.js'

describe('channel id constants', () => {
  it('matches the shared channel id rules', () => {
    expect(CHANNEL_ID_MIN_LENGTH).toBe(3)
    expect(CHANNEL_ID_MAX_LENGTH).toBe(30)
    expect(CHANNEL_ID_REGEX.test('most-box_room-1')).toBe(true)
    expect(CHANNEL_ID_REGEX.test('MostBox')).toBe(false)
    expect(CHANNEL_ID_REGEX.test('has space')).toBe(false)
  })
})

describe('normalizeChatChannelId', () => {
  it('trims and lowercases', () => {
    expect(normalizeChatChannelId('  MostBox  ')).toBe('mostbox')
  })

  it('treats missing input as an empty string', () => {
    expect(normalizeChatChannelId('')).toBe('')
    expect(normalizeChatChannelId(undefined)).toBe('')
    expect(normalizeChatChannelId(null)).toBe('')
  })

  it('treats every falsy value as an empty string', () => {
    // `String(input || '')` collapses 0 and false to '' before trimming.
    expect(normalizeChatChannelId(0)).toBe('')
    expect(normalizeChatChannelId(false)).toBe('')
  })
})

describe('createRandomChannelId', () => {
  it('produces a base32 id from 16 random bytes', () => {
    const id = createRandomChannelId(bytes => bytes.fill(0))
    expect(id).toBe('a'.repeat(26))
    expect(CHANNEL_ID_REGEX.test(id)).toBe(true)
  })

  it('produces different ids for different random input', () => {
    const first = createRandomChannelId(bytes => bytes.fill(1))
    const second = createRandomChannelId(bytes => bytes.fill(2))
    expect(first).not.toBe(second)
  })

  it('stays inside the channel id length limits', () => {
    const id = createRandomChannelId(bytes => bytes.fill(255))
    expect(id.length).toBeGreaterThanOrEqual(CHANNEL_ID_MIN_LENGTH)
    expect(id.length).toBeLessThanOrEqual(CHANNEL_ID_MAX_LENGTH)
  })

  it('reports when secure random generation is unavailable', () => {
    expect(() => createRandomChannelId(null)).not.toThrow()
  })
})

describe('getChannelIdFromHash', () => {
  it('strips the leading hash and decodes the value', () => {
    expect(getChannelIdFromHash('#MostBox')).toBe('mostbox')
    expect(getChannelIdFromHash('#most%2Dbox')).toBe('most-box')
  })

  it('returns an empty string for empty or malformed input', () => {
    expect(getChannelIdFromHash('')).toBe('')
    expect(getChannelIdFromHash('#')).toBe('')
    expect(getChannelIdFromHash(undefined)).toBe('')
    expect(getChannelIdFromHash('#%E0%A4%A')).toBe('')
  })
})

describe('parseChatChannelInput', () => {
  it('reads a bare hash', () => {
    expect(parseChatChannelInput('#MostBox')).toBe('mostbox')
  })

  it('reads an absolute chat url', () => {
    expect(parseChatChannelInput('https://most.box/chat/#mostbox')).toBe(
      'mostbox'
    )
  })

  it('reads a relative chat path', () => {
    expect(parseChatChannelInput('/chat/#mostbox')).toBe('mostbox')
  })

  it('rejects non-chat urls and paths', () => {
    expect(parseChatChannelInput('https://most.box/file/#mostbox')).toBe('')
    expect(parseChatChannelInput('/file/#mostbox')).toBe('')
  })

  it('falls back to treating the value as a raw channel id', () => {
    expect(parseChatChannelInput('  MostBox ')).toBe('mostbox')
  })

  it('returns an empty string for empty input', () => {
    expect(parseChatChannelInput('')).toBe('')
    expect(parseChatChannelInput('   ')).toBe('')
    expect(parseChatChannelInput(undefined)).toBe('')
  })
})

describe('share paths', () => {
  it('builds an encoded hash path', () => {
    expect(buildChatSharePath('MostBox')).toBe('/chat/#mostbox')
  })

  it('builds an absolute url without doubling slashes', () => {
    expect(buildChatShareUrl('mostbox', 'https://most.box/')).toBe(
      'https://most.box/chat/#mostbox'
    )
    expect(buildChatShareUrl('mostbox', 'https://most.box')).toBe(
      'https://most.box/chat/#mostbox'
    )
  })

  it('round trips through parseChatChannelInput', () => {
    const path = buildChatSharePath('Most-Box_1')
    expect(parseChatChannelInput(path)).toBe('most-box_1')
  })
})
