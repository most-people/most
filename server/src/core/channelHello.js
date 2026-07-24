import { Buffer } from 'node:buffer'

export const MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME = 256

const CHANNEL_TOPIC_HEX_REGEX = /^[0-9a-f]{64}$/

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
