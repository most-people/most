import crypto from 'node:crypto'

export const CHAT_FILE_ROOT = 'chat-file'
export const TRANSIENT_CHANNEL_TYPES = new Set(['game'])
export const CHANNEL_DISCOVERY_TIMEOUT = 600
export const CHANNEL_CANDIDATE_TTL = 30 * 1000

const CHANNEL_FINGERPRINT_BYTES = 8
const CHANNEL_WRITER_ID_BYTES = 8
const CHANNEL_KEY_SEPARATOR = '.'

export function normalizeChannelDisplayName(input, fallbackAddress = '') {
  const value = String(input || '').trim()
  if (value) return value.slice(0, 50)
  return fallbackAddress ? fallbackAddress.slice(0, 10) : ''
}

export function normalizeChannelAvatar(input) {
  const value = String(input || '').trim()
  return value ? value.slice(0, 4096) : ''
}

export function normalizeChannelId(input) {
  return String(input || '').trim()
}

export function createChannelFingerprint() {
  return crypto.randomBytes(CHANNEL_FINGERPRINT_BYTES).toString('hex')
}

export function createChannelWriterId() {
  return crypto.randomBytes(CHANNEL_WRITER_ID_BYTES).toString('hex')
}

export function buildChannelKey(channelId, fingerprint) {
  return `${channelId}${CHANNEL_KEY_SEPARATOR}${fingerprint}`
}

export function normalizeChannelKey(input) {
  return String(input || '').trim()
}

export function getChannelFingerprintFromKey(channelId, channelKey) {
  const prefix = `${channelId}${CHANNEL_KEY_SEPARATOR}`
  return channelKey.startsWith(prefix) ? channelKey.slice(prefix.length) : ''
}

export function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
}
