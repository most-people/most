export const CHAT_VISIBLE_LABEL_MAX_CODE_POINTS = 50

const INVISIBLE_UNICODE_RE = /[\p{Cc}\p{Cf}]/gu

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
