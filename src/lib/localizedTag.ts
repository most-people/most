import type { Locale } from '~/lib/i18n'

export type LocalizedTag = {
  default?: string
  [locale: string]: string | undefined
}

export type MemberTag = LocalizedTag | null

export type MemberTagPatch =
  | { action: 'unchanged' }
  | { action: 'clear'; tag: null }
  | { action: 'set'; tag: LocalizedTag }
  | { action: 'invalid' }

const CHAT_VISIBLE_LABEL_MAX_CODE_POINTS = 50
const INVISIBLE_UNICODE_RE = /[\p{Cc}\p{Cf}]/gu
const LOCALE_KEY_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/
const LOCALIZED_TAG_MAX_ENTRIES = 16

function normalizeVisibleTagValue(input: unknown) {
  if (typeof input !== 'string') return ''
  const normalized = input
    .normalize('NFC')
    .replace(INVISIBLE_UNICODE_RE, '')
    .trim()
  if (!normalized) return ''
  if (Array.from(normalized).length > CHAT_VISIBLE_LABEL_MAX_CODE_POINTS) {
    return ''
  }
  return normalized
}

function isLocalizedTagObject(
  input: unknown
): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function normalizeLocaleKey(input: unknown) {
  if (typeof input !== 'string') return ''
  const key = input.trim()
  if (key === 'default') return key
  return LOCALE_KEY_RE.test(key) ? key : ''
}

export function normalizeLocalizedTag(input: unknown): LocalizedTag | undefined {
  if (input === undefined) return undefined

  if (typeof input === 'string') {
    const value = normalizeVisibleTagValue(input)
    return value ? { default: value } : undefined
  }

  if (!isLocalizedTagObject(input)) return undefined

  const normalized: LocalizedTag = {}
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (Object.keys(normalized).length >= LOCALIZED_TAG_MAX_ENTRIES) break
    const key = normalizeLocaleKey(rawKey)
    if (!key) continue
    const value = normalizeVisibleTagValue(rawValue)
    if (!value) continue
    normalized[key] = value
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeMemberTagPatch(
  input: unknown,
  hasTag: boolean
): MemberTagPatch {
  if (!hasTag) return { action: 'unchanged' }
  if (input === null) return { action: 'clear', tag: null }
  if (typeof input !== 'string' && !isLocalizedTagObject(input)) {
    return { action: 'invalid' }
  }
  const tag = normalizeLocalizedTag(input)
  return tag ? { action: 'set', tag } : { action: 'invalid' }
}

function getTagValue(tag: LocalizedTag, key: string) {
  if (!key) return ''
  const direct = tag[key]
  if (direct) return direct
  const lowerKey = key.toLowerCase()
  const matchedKey = Object.keys(tag).find(
    candidate => candidate.toLowerCase() === lowerKey
  )
  return matchedKey ? tag[matchedKey] || '' : ''
}

function getLocaleCandidateKeys(locale: Locale) {
  const base = locale.split('-')[0] || locale
  const aliases =
    locale === 'zh-CN'
      ? ['zh-Hans']
      : locale === 'zh-TW'
        ? ['zh-Hant']
        : []
  return Array.from(new Set([locale, base, ...aliases, 'default', 'en']))
}

export function selectLocalizedTag(
  tag: LocalizedTag | undefined | null,
  locale: Locale
) {
  if (!tag) return ''
  for (const key of getLocaleCandidateKeys(locale)) {
    const value = getTagValue(tag, key)
    if (value) return value
  }
  const fallbackKey = Object.keys(tag).sort((a, b) => a.localeCompare(b))[0]
  return fallbackKey ? tag[fallbackKey] || '' : ''
}
