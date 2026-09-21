import { describe, expect, it } from 'vitest'

import {
  LOG_FILTER_OPTIONS,
  LOG_FILTER_TERMS,
  SEED_STATUS_HELP,
  bytesToGiB,
  formatDateTime,
  formatRecentTime,
  formatSeedStatus,
  formatUptime,
  getDayjsLocale,
  getNodeLogText,
  getSortTitle,
  gibToBytes,
  nodeLogMatchesFilter,
  parseInviteText,
  parsePathText,
  shortText,
  type AdminTranslate,
} from '~/features/admin/adminFormat'
import type { NodeHolding, NodeLog } from '~/features/admin/AdminPage'

// Echoes the key and params so tests assert the wiring, not the copy.
const t: AdminTranslate = (key, params) =>
  params ? `${key}(${JSON.stringify(params)})` : key

const log = (overrides: Partial<NodeLog> = {}): NodeLog => ({
  id: 'l1',
  ts: '2026-01-01T00:00:00.000Z',
  level: 'info',
  event: 'publish:success',
  message: 'Published',
  ...overrides,
})

const holding = (overrides: Partial<NodeHolding> = {}): NodeHolding => ({
  cid: 'cid-1',
  fileName: 'a.bin',
  size: 1,
  joined: false,
  ...overrides,
})

describe('formatUptime', () => {
  it('reports days and hours when over a day', () => {
    expect(formatUptime(90000, t)).toBe(
      'admin.uptime.daysHours({"days":1,"hours":1})'
    )
  })

  it('reports hours and minutes when under a day', () => {
    expect(formatUptime(3660, t)).toBe(
      'admin.uptime.hoursMinutes({"hours":1,"minutes":1})'
    )
  })

  it('reports minutes when under an hour', () => {
    expect(formatUptime(90, t)).toBe('admin.uptime.minutes({"minutes":1})')
  })

  it('clamps zero and negative input to zero minutes', () => {
    expect(formatUptime(0, t)).toBe('admin.uptime.minutes({"minutes":0})')
    expect(formatUptime(-10, t)).toBe('admin.uptime.minutes({"minutes":0})')
  })

  it('treats a non-numeric value as zero', () => {
    expect(formatUptime(Number.NaN, t)).toBe(
      'admin.uptime.minutes({"minutes":0})'
    )
  })
})

describe('bytesToGiB / gibToBytes', () => {
  it('converts bytes to a two-decimal GiB string', () => {
    expect(bytesToGiB(1024 ** 3)).toBe('1')
    // Rounds to two decimals. Avoid exact .005 boundaries, where the binary
    // representation of the product decides the result.
    expect(bytesToGiB(1024 ** 3 * 1.006)).toBe('1.01')
    expect(bytesToGiB(1024 ** 3 * 2.5)).toBe('2.5')
    expect(bytesToGiB(0)).toBe('0')
  })

  it('returns "0" for a non-finite byte count', () => {
    expect(bytesToGiB(Number.NaN)).toBe('0')
    expect(bytesToGiB(Number.POSITIVE_INFINITY)).toBe('0')
  })

  it('converts a GiB form value to bytes', () => {
    expect(gibToBytes('1')).toBe(1024 ** 3)
    expect(gibToBytes('0.5')).toBe(1024 ** 3 / 2)
  })

  it('returns 0 for invalid or negative GiB input', () => {
    expect(gibToBytes('-1')).toBe(0)
    expect(gibToBytes('abc')).toBe(0)
    expect(gibToBytes('')).toBe(0)
  })

  it('round trips a whole GiB value', () => {
    expect(bytesToGiB(gibToBytes('4'))).toBe('4')
  })
})

describe('parseInviteText', () => {
  it('splits on newlines and commas', () => {
    expect(parseInviteText('a\nb,c')).toEqual(['a', 'b', 'c'])
  })

  it('trims entries and drops blanks', () => {
    expect(parseInviteText('  a  \n\n , b ')).toEqual(['a', 'b'])
  })

  it('de-duplicates while preserving order', () => {
    expect(parseInviteText('b,a,b')).toEqual(['b', 'a'])
  })

  it('returns an empty list for empty input', () => {
    expect(parseInviteText('')).toEqual([])
    expect(parseInviteText('  ,  \n ')).toEqual([])
  })
})

describe('parsePathText', () => {
  it('splits on newlines only', () => {
    expect(parsePathText('a,b\nc')).toEqual(['a,b', 'c'])
  })

  it('trims and de-duplicates', () => {
    expect(parsePathText(' /a \n/a\n/b ')).toEqual(['/a', '/b'])
  })

  it('returns an empty list for empty input', () => {
    expect(parsePathText('')).toEqual([])
  })
})

describe('shortText', () => {
  it('returns a dash for empty input', () => {
    expect(shortText('')).toBe('-')
  })

  it('keeps short values intact', () => {
    expect(shortText('abcdef')).toBe('abcdef')
  })

  it('keeps values exactly at the threshold', () => {
    // head 12 + tail 8 + 3 === 23
    expect(shortText('x'.repeat(23))).toBe('x'.repeat(23))
  })

  it('collapses values past the threshold', () => {
    const value = 'a'.repeat(12) + 'b'.repeat(20) + 'c'.repeat(8)
    const result = shortText(value)
    expect(result).toBe(`${'a'.repeat(12)}...${'c'.repeat(8)}`)
    expect(result).toHaveLength(23)
  })

  it('honours custom head and tail sizes', () => {
    expect(shortText('abcdefghij', 2, 2)).toBe('ab...ij')
  })
})

describe('formatSeedStatus', () => {
  it.each([
    ['queued', 'admin.seedStatus.queued'],
    ['joining', 'admin.seedStatus.joining'],
    ['active', 'admin.seedStatus.active'],
    ['paused', 'admin.seedStatus.paused'],
  ])('maps %s to its label', (seedStatus, expected) => {
    expect(
      formatSeedStatus(holding({ seedStatus: seedStatus as never }), t)
    ).toBe(expected)
  })

  it('includes the error message when present', () => {
    expect(
      formatSeedStatus(holding({ seedStatus: 'error', seedError: 'boom' }), t)
    ).toBe('admin.seedStatus.errorWithMessage({"message":"boom"})')
  })

  it('falls back to the bare error label without a message', () => {
    expect(formatSeedStatus(holding({ seedStatus: 'error' }), t)).toBe(
      'admin.seedStatus.error'
    )
  })

  it('falls back to joined state when no status is set', () => {
    expect(formatSeedStatus(holding({ joined: true }), t)).toBe(
      'admin.seedStatus.active'
    )
    expect(formatSeedStatus(holding({ joined: false }), t)).toBe(
      'admin.seedStatus.notJoined'
    )
  })
})

describe('getDayjsLocale', () => {
  it('maps every supported locale', () => {
    expect(getDayjsLocale('zh-CN')).toBe('zh-cn')
    expect(getDayjsLocale('zh-TW')).toBe('zh-tw')
    expect(getDayjsLocale('en')).toBe('en')
  })
})

describe('formatDateTime', () => {
  it('formats a valid timestamp', () => {
    expect(formatDateTime('2026-03-04T05:06:07.000Z', t)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    )
  })

  it('returns the never label for missing or invalid input', () => {
    expect(formatDateTime(null, t)).toBe('admin.time.never')
    expect(formatDateTime(undefined, t)).toBe('admin.time.never')
    expect(formatDateTime('', t)).toBe('admin.time.never')
    expect(formatDateTime('not-a-date', t)).toBe('admin.time.never')
  })
})

describe('formatRecentTime', () => {
  it('returns the never label for missing or invalid input', () => {
    const translate = (key: string) => key
    expect(formatRecentTime(null, translate, 'en')).toBe('admin.time.never')
    expect(formatRecentTime('nope', translate, 'en')).toBe('admin.time.never')
  })

  it('returns justNow for a future timestamp', () => {
    const translate = (key: string) => key
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(formatRecentTime(future, translate, 'en')).toBe('admin.time.justNow')
  })

  it('returns a relative description for a past timestamp', () => {
    const translate = (key: string) => key
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const result = formatRecentTime(past, translate, 'en')
    expect(result).not.toBe('admin.time.never')
    expect(result).not.toBe('admin.time.justNow')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('getNodeLogText', () => {
  it('joins level, event, message, and serialized data in lower case', () => {
    const text = getNodeLogText(
      log({
        level: 'ERROR',
        event: 'Pull:Failed',
        message: 'Boom',
        data: { CID: 'X' },
      })
    )
    expect(text).toContain('error')
    expect(text).toContain('pull:failed')
    expect(text).toContain('boom')
    expect(text).toContain('"cid":"x"')
  })

  it('tolerates a log without data', () => {
    expect(getNodeLogText(log({ data: undefined }))).toContain('{}')
  })
})

describe('nodeLogMatchesFilter', () => {
  it('matches everything for all or blank filters', () => {
    expect(nodeLogMatchesFilter(log(), 'all')).toBe(true)
    expect(nodeLogMatchesFilter(log(), '')).toBe(true)
    expect(nodeLogMatchesFilter(log(), '   ')).toBe(true)
    expect(nodeLogMatchesFilter(log(), 'ALL')).toBe(true)
  })

  it('matches by term across the log text', () => {
    expect(nodeLogMatchesFilter(log({ event: 'topic:joined' }), 'join')).toBe(
      true
    )
    expect(
      nodeLogMatchesFilter(log({ message: 'p2p pull started' }), 'pull')
    ).toBe(true)
    expect(
      nodeLogMatchesFilter(log({ message: 'integrity check' }), 'verify')
    ).toBe(true)
    expect(
      nodeLogMatchesFilter(log({ event: 'publish:success' }), 'serve')
    ).toBe(true)
  })

  it('does not match an unrelated log', () => {
    expect(
      nodeLogMatchesFilter(log({ event: 'noop', message: 'idle' }), 'pull')
    ).toBe(false)
  })

  it('matches the error filter on the error level', () => {
    expect(
      nodeLogMatchesFilter(log({ level: 'error', message: 'x' }), 'error')
    ).toBe(true)
  })

  it('matches the error filter on an error term in the text', () => {
    expect(
      nodeLogMatchesFilter(
        log({ level: 'info', message: 'download failed' }),
        'error'
      )
    ).toBe(true)
  })

  it('does not match the error filter for an ordinary log', () => {
    expect(
      nodeLogMatchesFilter(
        log({ level: 'info', event: 'noop', message: 'idle' }),
        'error'
      )
    ).toBe(false)
  })

  it('falls back to using an unknown filter as its own term', () => {
    expect(
      nodeLogMatchesFilter(
        log({ message: 'custom-event happened' }),
        'custom-event'
      )
    ).toBe(true)
    expect(nodeLogMatchesFilter(log({ message: 'idle' }), 'custom-event')).toBe(
      false
    )
  })

  it('every configured filter option has usable terms', () => {
    for (const option of LOG_FILTER_OPTIONS) {
      if (option.value === 'all') continue
      expect(LOG_FILTER_TERMS[option.value]).toBeDefined()
      expect(LOG_FILTER_TERMS[option.value].length).toBeGreaterThan(0)
    }
  })
})

describe('getSortTitle', () => {
  it('describes the next action for each sort state', () => {
    expect(getSortTitle(false, t)).toBe('admin.table.sortAsc')
    expect(getSortTitle('asc', t)).toBe('admin.table.sortDesc')
    expect(getSortTitle('desc', t)).toBe('admin.table.sortClear')
  })
})

describe('admin option tables', () => {
  it('exposes one help entry per seed tone', () => {
    expect(SEED_STATUS_HELP.map(entry => entry.tone)).toEqual([
      'active',
      'pending',
      'muted',
      'error',
    ])
  })

  it('lists all, then the five log filters', () => {
    expect(LOG_FILTER_OPTIONS.map(option => option.value)).toEqual([
      'all',
      'join',
      'pull',
      'verify',
      'serve',
      'error',
    ])
  })
})
