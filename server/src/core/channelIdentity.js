import crypto from 'node:crypto'
import { normalizeAvatar, normalizeDisplayName } from './shared.js'

export const CHAT_FILE_ROOT = 'chat-file'
export const TRANSIENT_CHANNEL_TYPES = new Set(['game'])
export const CHANNEL_DISCOVERY_TIMEOUT = 600
export const CHANNEL_CANDIDATE_TTL = 30 * 1000

const CHANNEL_WRITER_ID_BYTES = 8

export function normalizeChannelDisplayName(input, fallbackAddress = '') {
  return normalizeDisplayName(
    input,
    fallbackAddress ? fallbackAddress.slice(0, 10) : ''
  )
}

export function normalizeChannelAvatar(input) {
  return normalizeAvatar(input)
}

export function normalizeChannelId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
}

export function createChannelWriterId() {
  return crypto.randomBytes(CHANNEL_WRITER_ID_BYTES).toString('hex')
}

export function buildChannelKey(channelId) {
  return normalizeChannelId(channelId)
}

export function normalizeChannelKey(input) {
  return normalizeChannelId(input)
}

export function isSpecialChannel(channel = {}) {
  return [channel.name, channel.channelId, channel.channelKey].some(value =>
    String(value || '').includes('.')
  )
}

export function uniqueStrings(values = []) {
  return [
    ...new Set(values.map(value => String(value || '').trim()).filter(Boolean)),
  ]
}
