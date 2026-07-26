import { Buffer } from 'node:buffer'
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export const MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME = 256
export const CHANNEL_PROOF_VERSION = 1
export const CHANNEL_PROOF_CHALLENGE_BYTES = 32

const CHANNEL_TOPIC_HEX_REGEX = /^[0-9a-f]{64}$/
const CHANNEL_PROOF_HEX_REGEX = /^[0-9a-f]{64}$/
const CHANNEL_PROOF_KEY_DOMAIN = 'most-box-channel-proof-key-v1'
const CHANNEL_PROOF_RESPONSE_DOMAIN = 'most-box-channel-proof-response-v1'

function normalizePublicKey(value) {
  let key = null
  if (typeof value === 'string' && CHANNEL_PROOF_HEX_REGEX.test(value)) {
    key = Buffer.from(value, 'hex')
  } else if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    key = Buffer.from(value)
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
  return Buffer.from(challenge).toString('hex')
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
    .update(Buffer.from(normalizedTopic, 'hex'))
    .update(Buffer.from(normalizedChallenge, 'hex'))
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
  return timingSafeEqual(
    Buffer.from(proof, 'hex'),
    Buffer.from(expected, 'hex')
  )
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
  maxFrameBytes
) {
  const frameLimit = Math.max(1, Number(maxFrameBytes) || 1)
  const messages = []
  let batch = []

  const buildMessage = nextChannels => ({
    ...baseMessage,
    channels: nextChannels,
  })
  const getFrameBytes = nextChannels =>
    Buffer.byteLength(JSON.stringify(buildMessage(nextChannels)))

  if (getFrameBytes([]) > frameLimit) {
    throw new RangeError('Channel hello header exceeds the frame limit')
  }

  for (const channel of channels) {
    const nextBatch = [...batch, channel]
    if (getFrameBytes(nextBatch) <= frameLimit) {
      batch = nextBatch
      continue
    }

    if (batch.length > 0) {
      messages.push(buildMessage(batch))
    }
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
