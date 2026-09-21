import { describe, expect, it } from 'vitest'

import type { ChannelMention, ChannelMessage } from '~/lib/channelApi'
import {
  formatDisplayName,
  getRenderableMentions,
  isMessageMentioningCurrentUser,
} from '~/features/chat/chatDisplay'

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

const mention = (
  start: number,
  end: number,
  label: string
): ChannelMention => ({
  address: ADDRESS,
  label,
  start,
  end,
})

const message = (overrides: Partial<ChannelMessage> = {}): ChannelMessage =>
  ({
    id: 'm1',
    channelId: 'c1',
    author: ADDRESS,
    content: '',
    timestamp: 0,
    ...overrides,
  }) as ChannelMessage

describe('formatDisplayName', () => {
  it('falls back to the short address when there is no name', () => {
    expect(formatDisplayName(undefined, ADDRESS, false)).toBe('0x1234...5678')
    expect(formatDisplayName('', ADDRESS, false)).toBe('0x1234...5678')
    expect(formatDisplayName('   ', ADDRESS, false)).toBe('0x1234...5678')
  })

  it('falls back to Unknown when there is neither a name nor an address', () => {
    expect(formatDisplayName(undefined, undefined, false)).toBe('Unknown')
    expect(formatDisplayName('', '', false)).toBe('Unknown')
  })

  it('strips a stored address suffix when the suffix is hidden', () => {
    expect(formatDisplayName('Alice#A1B2', ADDRESS, false)).toBe('Alice')
  })

  it('leaves a name without a suffix untouched when the suffix is hidden', () => {
    expect(formatDisplayName('Alice', ADDRESS, false)).toBe('Alice')
  })

  it('keeps an existing suffix when the suffix is shown', () => {
    expect(formatDisplayName('Alice#A1B2', ADDRESS, true)).toBe('Alice#A1B2')
  })

  it('appends the address suffix when the suffix is shown and missing', () => {
    expect(formatDisplayName('Alice', ADDRESS, true)).toBe('Alice#5678')
  })

  it('uses the last four address characters in upper case', () => {
    expect(
      formatDisplayName(
        'Alice',
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        true
      )
    ).toBe('Alice#BEEF')
  })

  it('keeps the name when the suffix is shown but no address is known', () => {
    expect(formatDisplayName('Alice', undefined, true)).toBe('Alice')
  })

  it('trims the name before deciding', () => {
    expect(formatDisplayName('  Alice  ', ADDRESS, false)).toBe('Alice')
  })
})

describe('getRenderableMentions', () => {
  const targets = [{ address: ADDRESS, label: 'Alice' }]

  it('keeps a mention whose range matches the text', () => {
    const content = 'hi @Alice there'
    const result = getRenderableMentions(
      message({ content, mentions: [mention(3, 9, 'Alice')] }),
      targets
    )
    expect(result).toHaveLength(1)
    expect(content.slice(result[0].start, result[0].end)).toBe('@Alice')
  })

  it('returns an empty list when the message has no mentions and no targets match', () => {
    expect(getRenderableMentions(message({ content: 'hello' }), [])).toEqual([])
  })

  it('drops a mention whose text no longer matches the label', () => {
    const result = getRenderableMentions(
      message({ content: 'hi @Bob there', mentions: [mention(3, 7, 'Alice')] }),
      targets
    )
    expect(result).toEqual([])
  })

  it('drops a mention that ends past the content length', () => {
    const result = getRenderableMentions(
      message({ content: 'hi @Ali', mentions: [mention(3, 99, 'Alice')] }),
      targets
    )
    expect(result).toEqual([])
  })

  it('drops a mention with a negative start or an empty range', () => {
    expect(
      getRenderableMentions(
        message({ content: 'hi @Alice', mentions: [mention(-1, 9, 'Alice')] }),
        targets
      )
    ).toEqual([])
    expect(
      getRenderableMentions(
        message({ content: 'hi @Alice', mentions: [mention(3, 3, 'Alice')] }),
        targets
      )
    ).toEqual([])
  })

  it('sorts mentions by start offset', () => {
    const content = '@Alice and @Alice'
    const result = getRenderableMentions(
      message({
        content,
        mentions: [mention(11, 17, 'Alice'), mention(0, 6, 'Alice')],
      }),
      targets
    )
    expect(result.map(m => m.start)).toEqual([0, 11])
  })

  it('drops overlapping mentions keeping the earliest', () => {
    const content = '@Alice'
    const result = getRenderableMentions(
      message({
        content,
        mentions: [mention(0, 6, 'Alice'), mention(2, 6, 'Alice')],
      }),
      targets
    )
    expect(result.map(m => m.start)).toEqual([0])
  })

  it('ignores the stored list when it is empty and scans the content instead', () => {
    const result = getRenderableMentions(
      message({ content: 'hi @Alice', mentions: [] }),
      targets
    )
    expect(result.map(m => m.start)).toEqual([3])
  })

  it('ignores a non-array mentions field', () => {
    const result = getRenderableMentions(
      message({
        content: 'hi @Alice',
        mentions: undefined as unknown as ChannelMention[],
      }),
      targets
    )
    expect(result.map(m => m.start)).toEqual([3])
  })

  it('tolerates a missing content field', () => {
    expect(
      getRenderableMentions(
        message({ content: undefined as unknown as string, mentions: [] }),
        targets
      )
    ).toEqual([])
  })
})

describe('isMessageMentioningCurrentUser', () => {
  const address = '0xAbCdEf0000000000000000000000000000000001'

  it('detects an address mention case-insensitively', () => {
    const msg = message({
      content: 'hi @Alice',
      mentions: [
        { address: address.toLowerCase(), label: 'Alice', start: 3, end: 9 },
      ],
    })
    expect(isMessageMentioningCurrentUser(msg, address.toUpperCase())).toBe(
      true
    )
  })

  it('returns false when the address is not mentioned', () => {
    const msg = message({ content: 'hi @Alice', mentions: [] })
    expect(isMessageMentioningCurrentUser(msg, address)).toBe(false)
  })

  it('returns false for an undefined address', () => {
    const msg = message({
      content: 'hi @Alice',
      mentions: [{ address, label: 'Alice', start: 3, end: 9 }],
    })
    expect(isMessageMentioningCurrentUser(msg, undefined)).toBe(false)
  })
})
