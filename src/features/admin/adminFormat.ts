/**
 * Pure admin-console formatting, parsing, and log-filter helpers.
 *
 * Extracted from `AdminPage.tsx`. They were already free of component state
 * (translations arrive as a `t` parameter), so they only needed a home and
 * tests. The log filter terms in particular are the contract behind the admin
 * log filter, and were previously untested.
 *
 * The only imports from `AdminPage.tsx` are type-only, so there is no runtime
 * cycle.
 */
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'

import type { Locale, MessageKey } from '~/lib/i18n'
import type { NodeHolding, NodeLog } from './AdminPage'

dayjs.extend(relativeTime)

/** Translator signature accepted by the admin formatting helpers. */
export type AdminTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string

/** Human-readable uptime in days/hours, hours/minutes, or minutes. */
export function formatUptime(seconds: number, t: AdminTranslate) {
  const total = Math.max(0, Number(seconds) || 0)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return t('admin.uptime.daysHours', { days, hours })
  if (hours > 0) return t('admin.uptime.hoursMinutes', { hours, minutes })
  return t('admin.uptime.minutes', { minutes })
}

/** Converts bytes to a GiB string rounded to two decimals. */
export function bytesToGiB(bytes: number) {
  if (!Number.isFinite(bytes)) return '0'
  return String(Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100)
}

/** Converts a GiB form value back to bytes; invalid or negative input is 0. */
export function gibToBytes(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 1024 * 1024 * 1024)
}

/** Splits pasted invite codes on newlines and commas, trimming and de-duplicating. */
export function parseInviteText(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  )
}

/** Splits pasted paths on newlines, trimming and de-duplicating. */
export function parsePathText(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean)
    )
  )
}

/** Collapses a long value to `head...tail`, or `-` when empty. */
export function shortText(text: string, head = 12, tail = 8) {
  if (!text) return '-'
  if (text.length <= head + tail + 3) return text
  return `${text.slice(0, head)}...${text.slice(-tail)}`
}

/** Localized seed status label, including the error message when present. */
export function formatSeedStatus(holding: NodeHolding, t: AdminTranslate) {
  switch (holding.seedStatus) {
    case 'queued':
      return t('admin.seedStatus.queued')
    case 'joining':
      return t('admin.seedStatus.joining')
    case 'active':
      return t('admin.seedStatus.active')
    case 'paused':
      return t('admin.seedStatus.paused')
    case 'error':
      return holding.seedError
        ? t('admin.seedStatus.errorWithMessage', {
            message: holding.seedError,
          })
        : t('admin.seedStatus.error')
    default:
      return holding.joined
        ? t('admin.seedStatus.active')
        : t('admin.seedStatus.notJoined')
  }
}

/** Maps a UI locale to the dayjs locale name used for relative time. */
export function getDayjsLocale(locale: Locale) {
  const dayjsLocales: Record<Locale, string> = {
    'zh-CN': 'zh-cn',
    'zh-TW': 'zh-tw',
    en: 'en',
  }
  return dayjsLocales[locale]
}

/** Relative timestamp, or the "never" label for a missing/invalid value. */
export function formatRecentTime(
  value: string | null | undefined,
  t: (key: MessageKey) => string,
  locale: Locale
) {
  if (!value) return t('admin.time.never')
  const time = dayjs(value)
  if (!time.isValid()) return t('admin.time.never')
  if (time.isAfter(dayjs())) return t('admin.time.justNow')
  const dayjsLocale = getDayjsLocale(locale)
  return time.locale(dayjsLocale).from(dayjs().locale(dayjsLocale))
}

/** Absolute `YYYY-MM-DD HH:mm` timestamp, or the "never" label. */
export function formatDateTime(
  value: string | null | undefined,
  t: AdminTranslate
) {
  if (!value) return t('admin.time.never')
  const time = dayjs(value)
  return time.isValid()
    ? time.format('YYYY-MM-DD HH:mm')
    : t('admin.time.never')
}

export const SEED_STATUS_HELP = [
  {
    labelKey: 'admin.seedHelp.active.label',
    tone: 'active',
    descKey: 'admin.seedHelp.active.desc',
  },
  {
    labelKey: 'admin.seedHelp.pending.label',
    tone: 'pending',
    descKey: 'admin.seedHelp.pending.desc',
  },
  {
    labelKey: 'admin.seedHelp.paused.label',
    tone: 'muted',
    descKey: 'admin.seedHelp.paused.desc',
  },
  {
    labelKey: 'admin.seedHelp.error.label',
    tone: 'error',
    descKey: 'admin.seedHelp.error.desc',
  },
] satisfies Array<{ labelKey: MessageKey; tone: string; descKey: MessageKey }>

export const LOG_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'admin.logFilter.all' },
  { value: 'join', labelKey: 'admin.logFilter.join' },
  { value: 'pull', labelKey: 'admin.logFilter.pull' },
  { value: 'verify', labelKey: 'admin.logFilter.verify' },
  { value: 'serve', labelKey: 'admin.logFilter.serve' },
  { value: 'error', labelKey: 'admin.logFilter.error' },
] satisfies Array<{ value: string; labelKey: MessageKey }>

/**
 * Search terms per log filter.
 *
 * A log matches a filter when its level, event, message, or serialized data
 * contains any of these terms, case-insensitively.
 */
export const LOG_FILTER_TERMS: Record<string, string[]> = {
  join: ['join', 'joined', 'topic'],
  pull: ['pull', 'p2p'],
  verify: ['verify', 'verified', 'integrity', 'download:success'],
  serve: ['seed', 'seeding', 'holding', 'publish:success', 'topic:joined'],
  error: ['error', 'failed', 'fail'],
}

/** Lower-cased haystack for log filtering: level, event, message, and data. */
export function getNodeLogText(log: NodeLog) {
  let dataText = ''
  try {
    dataText = JSON.stringify(log.data || {})
  } catch {}

  return [log.level, log.event, log.message, dataText]
    .map(value => String(value || '').toLowerCase())
    .join(' ')
}

/**
 * Whether a node log passes the admin log filter.
 *
 * `all` (and a blank filter) matches everything. The `error` filter additionally
 * requires the log level to be `error`, so a message merely containing the word
 * "error" is not enough on its own — unless one of its terms matches.
 */
export function nodeLogMatchesFilter(log: NodeLog, filter: string) {
  const normalized = String(filter || 'all')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'all') return true

  const text = getNodeLogText(log)
  if (normalized === 'error') {
    return (
      log.level === 'error' ||
      LOG_FILTER_TERMS.error.some(term => text.includes(term))
    )
  }

  const terms = LOG_FILTER_TERMS[normalized] || [normalized]
  return terms.some(term => text.includes(term))
}

export type SortState = false | 'asc' | 'desc'

/** Cycles the sort title: asc -> desc -> clear -> asc. */
export function getSortTitle(sort: SortState, t: AdminTranslate) {
  if (sort === 'asc') return t('admin.table.sortDesc')
  if (sort === 'desc') return t('admin.table.sortClear')
  return t('admin.table.sortAsc')
}
