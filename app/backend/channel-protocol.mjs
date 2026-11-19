import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import b4a from 'b4a'
import { CID } from 'multiformats/cid'
import { shortAddress } from '../shared/format-address.mjs'
import { channelIdFromKey, resolveChannelHandle } from './channel-keys-v2.mjs'

export const CHANNELS_FILE = 'mobile-channels.json'
export const CHANNEL_NAME_PREFIX = 'most-box-room-'
export const CHANNEL_NAME_MIN_LENGTH = 3
export const CHANNEL_NAME_MAX_LENGTH = 30
export const CHANNEL_NAME_REGEX = /^[a-z0-9_-]+$/
export const CHANNEL_MESSAGE_LIMIT = 100
export const CHANNEL_DISCOVERY_TIMEOUT = 600
export const CHANNEL_CANDIDATE_TTL = 30 * 1000
export const CHANNEL_PRESENCE_HEARTBEAT_MS = 15 * 1000
export const CHANNEL_PRESENCE_TIMEOUT_MS = 45 * 1000
export const MAX_CHANNEL_FRAME_BYTES = 128 * 1024
export const MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME = 256
export const CHANNEL_PROOF_CHALLENGE_BYTES = 32
export const MAX_CHANNEL_MESSAGE_LENGTH = 2000
export const MAX_CHANNEL_REMARK_LENGTH = 50
export const MAX_CHANNEL_ATTACHMENT_CID_LENGTH = 128
export const MAX_CHANNEL_ATTACHMENT_FILE_NAME_LENGTH = 255
export const MAX_CHANNEL_ATTACHMENT_LINK_LENGTH = 2048
export const MAX_CHANNEL_ATTACHMENT_MIME_TYPE_LENGTH = 100
export const CHANNEL_ATTACHMENT_KINDS = new Set([
  'image',
  'video',
  'audio',
  'text',
  'file',
])
export const DIAGNOSTIC_AUTHOR = '0x0000000000000000000000000000000000000001'
export const DIAGNOSTIC_AUTHOR_NAME = 'Android'

const CHANNEL_TOPIC_HEX_REGEX = /^[0-9a-f]{64}$/
const CHANNEL_PROOF_HEX_REGEX = /^[0-9a-f]{64}$/
const CHANNEL_PROOF_KEY_DOMAIN = 'most-box-channel-proof-key-v1'
const CHANNEL_PROOF_RESPONSE_DOMAIN = 'most-box-channel-proof-response-v1'

function normalizePublicKey(value) {
  let key = null
  if (typeof value === 'string' && CHANNEL_PROOF_HEX_REGEX.test(value)) {
    key = b4a.from(value, 'hex')
  } else if (value && typeof value === 'object') {
    key = b4a.from(value)
  }
  return key?.length === 32 ? key : null
}

export function normalizeChannelProofChallenge(input) {
  const challenge = String(input || '')
    .trim()
    .toLowerCase()
  return CHANNEL_PROOF_HEX_REGEX.test(challenge) ? challenge : ''
}

export function createChannelProofChallenge(createBytes = randomBytes) {
  const challenge = createBytes(CHANNEL_PROOF_CHALLENGE_BYTES)
  if (!challenge || challenge.length !== CHANNEL_PROOF_CHALLENGE_BYTES) {
    throw new Error('Secure channel proof challenge generation failed')
  }
  return b4a.toString(challenge, 'hex')
}

export function createChannelTopicProof({
  channelId,
  topic,
  challenge,
  proverPublicKey,
  verifierPublicKey,
}) {
  const normalizedChannelId = String(channelId || '')
    .trim()
    .toLowerCase()
  const [normalizedTopic] = normalizeChannelScopeTopics([topic])
  const normalizedChallenge = normalizeChannelProofChallenge(challenge)
  const proverKey = normalizePublicKey(proverPublicKey)
  const verifierKey = normalizePublicKey(verifierPublicKey)
  if (
    !normalizedChannelId ||
    !normalizedTopic ||
    !normalizedChallenge ||
    !proverKey ||
    !verifierKey
  ) {
    return ''
  }

  const proofKey = createHash('sha256')
    .update(CHANNEL_PROOF_KEY_DOMAIN)
    .update('\0')
    .update(normalizedChannelId)
    .digest()

  return createHmac('sha256', proofKey)
    .update(CHANNEL_PROOF_RESPONSE_DOMAIN)
    .update('\0')
    .update(b4a.from(normalizedTopic, 'hex'))
    .update(b4a.from(normalizedChallenge, 'hex'))
    .update(proverKey)
    .update(verifierKey)
    .digest('hex')
}

export function verifyChannelTopicProof(input, proofInput) {
  const proof = String(proofInput || '')
    .trim()
    .toLowerCase()
  if (!CHANNEL_PROOF_HEX_REGEX.test(proof)) return false

  const expected = createChannelTopicProof(input)
  if (!expected) return false
  return timingSafeEqual(b4a.from(proof, 'hex'), b4a.from(expected, 'hex'))
}

export function normalizeChannelId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
}

export function buildChannelKey(channelId) {
  return normalizeChannelId(channelId)
}

export function normalizeChannelKey(input) {
  return normalizeChannelId(input)
}

export function uniqueStrings(values = []) {
  return [
    ...new Set(values.map(value => String(value || '').trim()).filter(Boolean)),
  ]
}

function getChannelId(channel) {
  return String(
    channel?.channelId || channel?.channelKey || channel?.name || ''
  ).trim()
}

function getAllowedChannelIds(values = []) {
  if (values instanceof Set) return values
  return new Set(
    [...values].map(value => String(value || '').trim()).filter(Boolean)
  )
}

export function normalizeChannelScopeTopics(topics = []) {
  const normalized = []
  const seen = new Set()
  for (const topic of Array.isArray(topics) ? topics : []) {
    const topicHex = String(topic || '')
      .trim()
      .toLowerCase()
    if (!CHANNEL_TOPIC_HEX_REGEX.test(topicHex) || seen.has(topicHex)) continue
    seen.add(topicHex)
    normalized.push(topicHex)
  }
  return normalized
}

export function chunkChannelScopeTopics(
  topics = [],
  chunkSize = MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME
) {
  const normalized = normalizeChannelScopeTopics(topics)
  const size = Math.max(1, Number(chunkSize) || 1)
  const chunks = []
  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size))
  }
  return chunks
}

export function selectChannelsForHello(channels = [], allowedChannelIds = []) {
  const allowed = getAllowedChannelIds(allowedChannelIds)
  return channels.filter(channel => allowed.has(getChannelId(channel)))
}

export function isChannelAllowedForConnection(
  channelIdInput,
  allowedChannelIds = []
) {
  const channelId = String(channelIdInput || '').trim()
  return (
    Boolean(channelId) && getAllowedChannelIds(allowedChannelIds).has(channelId)
  )
}

export function buildChannelHelloMessages(
  baseMessage,
  channels = [],
  maxFrameBytes = MAX_CHANNEL_FRAME_BYTES
) {
  const frameLimit = Math.max(1, Number(maxFrameBytes) || 1)
  const messages = []
  let batch = []

  const buildMessage = nextChannels => ({
    ...baseMessage,
    channels: nextChannels,
  })
  const getFrameBytes = nextChannels =>
    b4a.byteLength(JSON.stringify(buildMessage(nextChannels)))

  if (getFrameBytes([]) > frameLimit) {
    throw new RangeError('Channel hello header exceeds the frame limit')
  }

  for (const channel of channels) {
    const nextBatch = [...batch, channel]
    if (getFrameBytes(nextBatch) <= frameLimit) {
      batch = nextBatch
      continue
    }

    if (batch.length > 0) messages.push(buildMessage(batch))
    if (getFrameBytes([channel]) > frameLimit) {
      throw new RangeError('Channel hello entry exceeds the frame limit')
    }
    batch = [channel]
  }

  if (batch.length > 0 || messages.length === 0) {
    messages.push(buildMessage(batch))
  }
  return messages
}

function channelFrameTooLargeError(maxFrameBytes) {
  const error = new RangeError(
    `Channel frame exceeds the ${maxFrameBytes} byte limit`
  )
  error.code = 'CHANNEL_FRAME_TOO_LARGE'
  return error
}

export function consumeChannelFrames(
  remainder,
  chunk,
  maxFrameBytes = MAX_CHANNEL_FRAME_BYTES
) {
  let pending = remainder ? b4a.from(remainder) : b4a.alloc(0)
  const input = b4a.from(chunk || '')
  const frames = []
  let offset = 0

  while (offset < input.length) {
    const newlineIndex = input.indexOf(0x0a, offset)
    if (newlineIndex === -1) break

    const segment = input.subarray(offset, newlineIndex)
    if (pending.length + segment.length > maxFrameBytes) {
      throw channelFrameTooLargeError(maxFrameBytes)
    }
    const frame = pending.length ? b4a.concat([pending, segment]) : segment
    frames.push(b4a.toString(frame, 'utf8').trim())
    pending = b4a.alloc(0)
    offset = newlineIndex + 1
  }

  const tail = input.subarray(offset)
  if (pending.length + tail.length > maxFrameBytes) {
    throw channelFrameTooLargeError(maxFrameBytes)
  }

  return {
    frames,
    remainder: pending.length ? b4a.concat([pending, tail]) : b4a.from(tail),
  }
}

export function normalizeChannelPresenceAddress(value) {
  const address = String(value || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : ''
}

export function normalizeChannelPresenceDisplayName(
  input,
  fallbackAddress = ''
) {
  const displayName = String(input || '').trim()
  const fallback = shortAddress(fallbackAddress)
  return (displayName || fallback).slice(0, 50)
}

export function normalizeChannelPresenceAvatar(input) {
  return String(input || '')
    .trim()
    .slice(0, 4096)
}

export function normalizeChannelRemark(input) {
  return String(input || '')
    .trim()
    .slice(0, MAX_CHANNEL_REMARK_LENGTH)
}

export function normalizeBoolean(input) {
  return input === true
}

function sanitizeAttachmentFileName(input) {
  const value = String(input || '')
    .replace(/\\/g, '/')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .replace(/\.\./g, '_')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
  return (
    value
      .split('/')
      .map(segment => segment.slice(0, MAX_CHANNEL_ATTACHMENT_FILE_NAME_LENGTH))
      .join('/') || 'unnamed_file'
  )
}

function decodeQueryPart(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'))
  } catch {
    return value
  }
}

function parseMostAttachmentLinkQuery(search) {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!query) return { fileName: '', unsupportedQuery: false }

  let fileName = ''
  for (const part of query.split('&')) {
    if (!part) continue

    const separatorIndex = part.indexOf('=')
    const rawKey = separatorIndex === -1 ? part : part.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1)
    const key = decodeQueryPart(rawKey)
    if (key !== 'filename') {
      return { fileName: '', unsupportedQuery: true }
    }

    if (!fileName) {
      fileName = decodeQueryPart(rawValue).trim()
    }
  }

  return { fileName, unsupportedQuery: false }
}

function parseMostAttachmentLink(link) {
  let url
  try {
    url = new URL(link)
  } catch {
    return null
  }

  if (url.protocol !== 'most:') return null
  if (url.pathname && url.pathname !== '/') return null

  const query = parseMostAttachmentLinkQuery(url.search)
  if (query.unsupportedQuery) return null

  const cid = url.hostname
  try {
    const parsedCid = CID.parse(cid)
    if (parsedCid.version !== 1) return null
    if (parsedCid.multihash.digest.length !== 32) return null
  } catch {
    return null
  }

  return {
    cid,
    fileName: query.fileName || cid,
  }
}

function buildMostAttachmentLink(cid, fileName) {
  return `most://${cid}?filename=${encodeURIComponent(fileName)}`
}

export function normalizeChannelAttachment(input = {}) {
  if (!input || typeof input !== 'object') return undefined

  const kind = String(input.kind || 'file').trim()
  const cid = String(input.cid || '').trim()
  const fileName = sanitizeAttachmentFileName(input.fileName)
  const link = String(input.link || '').trim()
  const parsedLink = parseMostAttachmentLink(link)

  if (!cid || !fileName || fileName === 'unnamed_file') return undefined
  if (!link || !parsedLink) return undefined
  if (cid.length > MAX_CHANNEL_ATTACHMENT_CID_LENGTH) return undefined
  if (link.length > MAX_CHANNEL_ATTACHMENT_LINK_LENGTH) return undefined
  if (parsedLink.cid !== cid) return undefined
  if (sanitizeAttachmentFileName(parsedLink.fileName) !== fileName) {
    return undefined
  }

  const attachment = {
    kind: CHANNEL_ATTACHMENT_KINDS.has(kind) ? kind : 'file',
    cid,
    fileName,
    link: buildMostAttachmentLink(cid, fileName),
  }

  if (
    typeof input.mimeType === 'string' &&
    input.mimeType.trim().length > 0 &&
    input.mimeType.trim().length <= MAX_CHANNEL_ATTACHMENT_MIME_TYPE_LENGTH
  ) {
    attachment.mimeType = input.mimeType.trim()
  }

  if (input.size !== undefined && input.size !== null) {
    const size = Number(input.size)
    if (!Number.isFinite(size) || size < 0) return undefined
    attachment.size = Math.floor(size)
  }

  return attachment
}

export function createChannelWriterId() {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16)
}

export function assertValidChannelId(channelId) {
  const normalized = normalizeChannelId(channelId)
  if (!normalized) throw new Error('Channel name is required')
  if (normalized.includes('.')) {
    throw new Error('Dotted channel names are reserved for system channels')
  }
  if (!CHANNEL_NAME_REGEX.test(normalized)) {
    throw new Error('Channel names may only contain letters, numbers, _ and -')
  }
  if (normalized.length < CHANNEL_NAME_MIN_LENGTH) {
    throw new Error(
      `Channel name must be at least ${CHANNEL_NAME_MIN_LENGTH} characters`
    )
  }
  if (normalized.length > CHANNEL_NAME_MAX_LENGTH) {
    throw new Error(
      `Channel name must be at most ${CHANNEL_NAME_MAX_LENGTH} characters`
    )
  }
  return normalized
}

export function generateChannelDiscoveryKey(channelKey) {
  const normalizedChannelKey = normalizeChannelKey(channelKey)
  return createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}channel:${normalizedChannelKey}`)
    .digest()
}

export function generateChannelChatDiscoveryKey(channelKey) {
  const normalizedChannelKey = normalizeChannelKey(channelKey)
  return createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}channel:${normalizedChannelKey}:chat`)
    .digest()
}

export function generateChannelIdDiscoveryKey(channelId) {
  const normalizedChannelId = normalizeChannelId(channelId)
  return createHash('sha256')
    .update(`${CHANNEL_NAME_PREFIX}id:${normalizedChannelId}:candidates`)
    .digest()
}

/**
 * New v2 channel record from a resolved channel handle (channel-keys-v2.mjs
 * resolveChannelHandle). `channelId` is the handle shown and shared locally;
 * `channelKey` is the public channel ID used on the wire.
 */
export function createChannelRecord(resolved, type = 'public', options = {}) {
  return {
    channelId: resolved.handle,
    channelKey: resolved.channelKey,
    secretKey: b4a.toString(resolved.key, 'hex'),
    kind: resolved.kind,
    type: String(type || 'public').trim() || 'public',
    createdAt: options.createdAt || new Date().toISOString(),
    lastMessageAt: options.lastMessageAt || '',
    remark: normalizeChannelRemark(options.remark),
    pinned: options.pinned === true,
    writerGeneration: 0,
    localWriterCoreKey: '',
    writerCoreKeys: uniqueStrings(options.writerCoreKeys || []),
  }
}

const HEX_64_REGEX = /^[0-9a-f]{64}$/

/**
 * Loads a persisted record. v2 records are checked against their secret key;
 * v1 records (no secretKey) are migrated by resolving the old ID as a handle,
 * keeping their writer cores readable. Returns null for invalid records.
 */
export function normalizeChannelRecord(record = {}) {
  const writerCoreKeys = uniqueStrings(
    Array.isArray(record.writerCoreKeys) ? record.writerCoreKeys : []
  )
  const common = {
    type: String(record.type || 'public').trim() || 'public',
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
    lastMessageAt:
      typeof record.lastMessageAt === 'string' ? record.lastMessageAt : '',
    remark: normalizeChannelRemark(record.remark),
    pinned: normalizeBoolean(record.pinned),
  }

  if (
    typeof record.secretKey === 'string' &&
    HEX_64_REGEX.test(record.secretKey)
  ) {
    const channelKey = channelIdFromKey(b4a.from(record.secretKey, 'hex'))
    const channelId = String(record.channelId || '').trim()
    if (record.channelKey !== channelKey || !channelId) return null
    return {
      ...common,
      channelId,
      channelKey,
      secretKey: record.secretKey,
      kind: String(record.kind || 'private'),
      writerGeneration: Number.isInteger(record.writerGeneration)
        ? record.writerGeneration
        : 0,
      localWriterCoreKey: String(record.localWriterCoreKey || '').trim(),
      ...(Array.isArray(record.legacyWriterCoreKeys)
        ? { legacyWriterCoreKeys: record.legacyWriterCoreKeys }
        : {}),
      writerCoreKeys: uniqueStrings([
        ...writerCoreKeys,
        record.localWriterCoreKey,
      ]),
    }
  }

  const resolved = resolveChannelHandle(record.channelId)
  if (!resolved) return null
  return {
    ...createChannelRecord(resolved, common.type, common),
    legacyWriterCoreKeys: uniqueStrings([
      ...writerCoreKeys,
      record.localWriterCoreKey,
    ]),
  }
}

export function formatChannelForResponse(channel, peerCount = 0) {
  return {
    name: channel.channelId,
    channelId: channel.channelId,
    channelKey: channel.channelKey,
    key: channel.channelKey,
    type: channel.type,
    kind: channel.kind,
    public: channel.kind === 'public',
    createdAt: channel.createdAt,
    lastMessageAt: channel.lastMessageAt || '',
    remark: channel.remark || '',
    pinned: channel.pinned === true,
    localWriterCoreKey: channel.localWriterCoreKey || '',
    writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
    peerCount,
  }
}

export function normalizeChannelMessage(input = {}, options = {}) {
  const clientMessageId =
    typeof input.clientMessageId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.clientMessageId.trim()
    )
      ? input.clientMessageId.trim().toLowerCase()
      : ''
  if (options.requireClientMessageId && !clientMessageId)
    throw new Error('Invalid clientMessageId')
  const content = String(input.content || '').trim()
  if (!content) throw new Error('Channel message content is required')
  if (content.length > MAX_CHANNEL_MESSAGE_LENGTH) {
    throw new Error(
      `Channel message content must be at most ${MAX_CHANNEL_MESSAGE_LENGTH} characters`
    )
  }
  const hasAttachmentInput =
    input.attachment !== undefined && input.attachment !== null
  const attachment = normalizeChannelAttachment(input.attachment)
  if (hasAttachmentInput && !attachment && options.requireAttachment) {
    throw new Error('Invalid channel attachment')
  }
  if (attachment && content !== attachment.link) {
    if (options.requireAttachment) {
      throw new Error('attachment content must match link')
    }
    return {
      type: 'message',
      author: String(input.author || DIAGNOSTIC_AUTHOR).trim(),
      authorName: String(input.authorName || DIAGNOSTIC_AUTHOR_NAME).trim(),
      content,
      timestamp: Number(options.timestamp || input.timestamp || Date.now()),
      ...(clientMessageId ? { clientMessageId } : {}),
    }
  }

  return {
    type: 'message',
    author: String(input.author || DIAGNOSTIC_AUTHOR).trim(),
    authorName: String(input.authorName || DIAGNOSTIC_AUTHOR_NAME).trim(),
    content,
    timestamp: Number(options.timestamp || input.timestamp || Date.now()),
    ...(clientMessageId ? { clientMessageId } : {}),
    ...(attachment ? { attachment } : {}),
  }
}

export function sortChannelMessages(
  messages = [],
  limit = CHANNEL_MESSAGE_LIMIT,
  offset = 0
) {
  // Sort before deduping so a duplicate keeps its earliest copy, ordered by
  // (ts, writer core key, block index) like the desktop engine (§4.5).
  const ordered = [...messages].sort(
    (a, b) =>
      Number(a.timestamp) - Number(b.timestamp) ||
      String(a._coreKey || '').localeCompare(String(b._coreKey || '')) ||
      (Number(a._index) || 0) - (Number(b._index) || 0)
  )
  const seen = new Set()
  const unique = []

  for (const message of ordered) {
    if (!message || !['message', 'legacy'].includes(message.type)) continue
    const attachmentLink = message.attachment?.link || ''
    const author =
      normalizeChannelPresenceAddress(message.author) || message.author
    const key = message.clientMessageId
      ? `client:${author}:${message.clientMessageId}`
      : `${message._coreKey || ''}:${message.author}:${message.timestamp}:${message.content}:${attachmentLink}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(message)
  }

  const total = unique.length
  const safeLimit = Math.max(1, Number(limit) || CHANNEL_MESSAGE_LIMIT)
  const safeOffset = Math.max(0, Number(offset) || 0)
  const start = Math.max(0, total - safeOffset - safeLimit)
  const end = total - safeOffset

  return unique
    .slice(start, end)
    .map(({ _coreKey, _index, ...message }) => message)
}
