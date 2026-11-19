import crypto from 'node:crypto'
import { CHANNEL_NAME_PREFIX } from '../config.js'
import { normalizeAvatar, normalizeDisplayName } from './shared.js'

export const CHAT_FILE_ROOT = 'chat-file'
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

// Topics: file swarm channel replication, chat swarm channel chat, and chat
// swarm candidate discovery. See docs/protocol/discovery.md §3.
export function generateChannelDiscoveryKey(channelKey) {
  return crypto
    .createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}channel:${normalizeChannelKey(channelKey)}`)
    .digest()
}

export function generateChannelChatDiscoveryKey(channelKey) {
  return crypto
    .createHash('sha256')
    .update(
      `${CHANNEL_NAME_PREFIX}channel:${normalizeChannelKey(channelKey)}:chat`
    )
    .digest()
}

export function generateChannelIdDiscoveryKey(channelId) {
  return crypto
    .createHash('sha256')
    .update(
      `${CHANNEL_NAME_PREFIX}id:${normalizeChannelId(channelId)}:candidates`
    )
    .digest()
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
