export const CHAT_VISIBLE_LABEL_MAX_CODE_POINTS = 50
export const LOCALIZED_CHAT_TAG_MAX_ENTRIES = 16

const INVISIBLE_UNICODE_RE = /[\p{Cc}\p{Cf}]/gu
const LOCALE_KEY_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/

export function normalizeVisibleChatLabel(input) {
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

export function hasVisibleChatLabel(input) {
  return Boolean(normalizeVisibleChatLabel(input))
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLocaleKey(input) {
  if (typeof input !== 'string') return ''
  const key = input.trim()
  if (key === 'default') return key
  return LOCALE_KEY_RE.test(key) ? key : ''
}

export function normalizeLocalizedChatTag(input) {
  if (input === undefined) return undefined

  if (typeof input === 'string') {
    const value = normalizeVisibleChatLabel(input)
    return value ? { default: value } : undefined
  }

  if (!isRecord(input)) return undefined

  const normalized = {}
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (Object.keys(normalized).length >= LOCALIZED_CHAT_TAG_MAX_ENTRIES) break
    const key = normalizeLocaleKey(rawKey)
    if (!key) continue
    const value = normalizeVisibleChatLabel(rawValue)
    if (!value) continue
    normalized[key] = value
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeChatMemberTagPatch(input, hasTag) {
  if (!hasTag) return { action: 'unchanged' }
  if (input === null) return { action: 'clear', tag: null }
  if (typeof input !== 'string' && !isRecord(input)) {
    return { action: 'invalid' }
  }
  const tag = normalizeLocalizedChatTag(input)
  return tag ? { action: 'set', tag } : { action: 'invalid' }
}
