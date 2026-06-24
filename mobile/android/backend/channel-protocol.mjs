import { createHash } from 'node:crypto'

export const CHANNELS_FILE = 'mobile-channels.json'
export const CHANNEL_NAME_PREFIX = 'most-box-room-'
export const CHANNEL_NAME_MIN_LENGTH = 3
export const CHANNEL_NAME_MAX_LENGTH = 30
export const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/
export const CHANNEL_MESSAGE_LIMIT = 100
export const CHANNEL_DISCOVERY_TIMEOUT = 600
export const CHANNEL_CANDIDATE_TTL = 30 * 1000
export const CHANNEL_PRESENCE_HEARTBEAT_MS = 15 * 1000
export const CHANNEL_PRESENCE_TIMEOUT_MS = 45 * 1000
export const MAX_CHANNEL_MESSAGE_LENGTH = 2000
export const DIAGNOSTIC_AUTHOR =
  '0x0000000000000000000000000000000000000001'
export const DIAGNOSTIC_AUTHOR_NAME = 'Android'

export function normalizeChannelId(input) {
  return String(input || '').trim()
}

export function buildChannelKey(channelId) {
  return normalizeChannelId(channelId)
}

export function normalizeChannelKey(input) {
  return String(input || '').trim()
}

export function uniqueStrings(values = []) {
  return [
    ...new Set(values.map(value => String(value || '').trim()).filter(Boolean)),
  ]
}

export function normalizeChannelPresenceAddress(value) {
  const address = String(value || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : ''
}

export function normalizeChannelPresenceDisplayName(input, fallbackAddress = '') {
  const displayName = String(input || '').trim()
  const fallback = fallbackAddress
    ? `${fallbackAddress.slice(0, 6)}...${fallbackAddress.slice(-4)}`
    : ''
  return (displayName || fallback).slice(0, 50)
}

export function normalizeChannelPresenceAvatar(input) {
  return String(input || '').trim().slice(0, 4096)
}

export function createChannelWriterId() {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16)
}

export function assertValidChannelId(channelId, type = 'public') {
  const normalized = normalizeChannelId(channelId)
  if (!normalized) throw new Error('Channel name is required')
  if (normalized.includes('.') && type !== 'game') {
    throw new Error('Dotted channel names are reserved for system channels')
  }
  if (type === 'game' && !/^game\.[a-z0-9]+\.[a-z0-9]+$/.test(normalized)) {
    throw new Error('Game channels must use game.<gameId>.<roomCode>')
  }
  if (type !== 'game' && !CHANNEL_NAME_REGEX.test(normalized)) {
    throw new Error('Channel names may only contain letters, numbers, _ and -')
  }
  if (normalized.length < CHANNEL_NAME_MIN_LENGTH) {
    throw new Error(`Channel name must be at least ${CHANNEL_NAME_MIN_LENGTH} characters`)
  }
  if (normalized.length > CHANNEL_NAME_MAX_LENGTH) {
    throw new Error(`Channel name must be at most ${CHANNEL_NAME_MAX_LENGTH} characters`)
  }
  return normalized
}

export function generateChannelDiscoveryKey(channelKey) {
  return createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}channel:${channelKey}`)
    .digest()
}

export function generateChannelChatDiscoveryKey(channelKey) {
  return createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}channel:${channelKey}:chat`)
    .digest()
}

export function generateChannelIdDiscoveryKey(channelId) {
  return createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}id:${channelId}:candidates`)
    .digest()
}

export function createChannelRecord(channelIdInput, type = 'public', options = {}) {
  const channelId = assertValidChannelId(channelIdInput, type)
  const channelKey = buildChannelKey(channelId)
  const createdAt = options.createdAt || new Date().toISOString()

  return normalizeChannelRecord({
    channelId,
    channelKey,
    type,
    createdAt,
    lastMessageAt: options.lastMessageAt || '',
    localWriterCoreKey: options.localWriterCoreKey || '',
    writerCoreKeys: options.writerCoreKeys || [],
    writerId: options.writerId || createChannelWriterId(),
  })
}

export function normalizeChannelRecord(record = {}) {
  const type = String(record.type || 'public').trim() || 'public'
  const channelId = assertValidChannelId(record.channelId, type)
  const channelKey = buildChannelKey(channelId)
  const localWriterCoreKey = String(record.localWriterCoreKey || '').trim()

  return {
    channelId,
    channelKey,
    type,
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
    lastMessageAt:
      typeof record.lastMessageAt === 'string' ? record.lastMessageAt : '',
    localWriterCoreKey,
    writerCoreKeys: uniqueStrings([
      ...(Array.isArray(record.writerCoreKeys) ? record.writerCoreKeys : []),
      localWriterCoreKey,
    ]),
    writerId: String(record.writerId || createChannelWriterId()).trim(),
  }
}

export function channelToCandidate(channel, local = false) {
  return {
    channelId: channel.channelId,
    channelKey: channel.channelKey,
    type: channel.type,
    createdAt: channel.createdAt,
    lastMessageAt: channel.lastMessageAt || '',
    writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
    local,
  }
}

export function formatChannelForResponse(channel, peerCount = 0) {
  return {
    name: channel.channelId,
    channelId: channel.channelId,
    channelKey: channel.channelKey,
    key: channel.channelKey,
    type: channel.type,
    createdAt: channel.createdAt,
    lastMessageAt: channel.lastMessageAt || '',
    localWriterCoreKey: channel.localWriterCoreKey || '',
    writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
    peerCount,
  }
}

export function normalizeChannelMessage(input = {}, options = {}) {
  const content = String(input.content || '').trim()
  if (!content) throw new Error('Channel message content is required')
  if (content.length > MAX_CHANNEL_MESSAGE_LENGTH) {
    throw new Error(
      `Channel message content must be at most ${MAX_CHANNEL_MESSAGE_LENGTH} characters`
    )
  }

  return {
    type: 'message',
    author: String(input.author || DIAGNOSTIC_AUTHOR).trim(),
    authorName: String(input.authorName || DIAGNOSTIC_AUTHOR_NAME).trim(),
    content,
    timestamp: Number(options.timestamp || input.timestamp || Date.now()),
  }
}

export function sortChannelMessages(messages = [], limit = CHANNEL_MESSAGE_LIMIT, offset = 0) {
  const seen = new Set()
  const unique = []

  for (const message of messages) {
    if (!message || message.type !== 'message') continue
    const key = `${message._coreKey || ''}:${message.author}:${message.timestamp}:${message.content}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(message)
  }

  unique.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))

  const total = unique.length
  const safeLimit = Math.max(1, Number(limit) || CHANNEL_MESSAGE_LIMIT)
  const safeOffset = Math.max(0, Number(offset) || 0)
  const start = Math.max(0, total - safeOffset - safeLimit)
  const end = total - safeOffset

  return unique.slice(start, end).map(({ _coreKey, _index, ...message }) => message)
}
