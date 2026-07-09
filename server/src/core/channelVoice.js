import {
  buildChannelKey,
  normalizeChannelAvatar,
  normalizeChannelDisplayName,
  normalizeChannelId,
} from './channelIdentity.js'
import { normalizeOwnerAddress } from './ownerMetadata.js'
import { ValidationError } from '../utils/errors.js'

export const CHANNEL_VOICE_EVENTS = new Set([
  'join',
  'state',
  'heartbeat',
  'leave',
  'signal',
])

const CHANNEL_VOICE_SIGNAL_TYPES = new Set(['offer', 'answer', 'candidate'])
const CHANNEL_VOICE_SESSION_REGEX = /^[a-zA-Z0-9_-]{3,80}$/
const CHANNEL_VOICE_SIGNAL_MAX_BYTES = 64 * 1024

function normalizeSessionId(value, label = 'voice session') {
  const sessionId = String(value || '').trim()
  if (!CHANNEL_VOICE_SESSION_REGEX.test(sessionId)) {
    throw new ValidationError(`Invalid ${label}`)
  }
  return sessionId
}

function assertPayloadSize(value, message) {
  const size = Buffer.byteLength(JSON.stringify(value || {}), 'utf8')
  if (size > CHANNEL_VOICE_SIGNAL_MAX_BYTES) {
    throw new ValidationError(message)
  }
}

function normalizeSignal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('voice signal is required')
  }

  assertPayloadSize(input, 'voice signal is too large')

  const type = String(input.type || '').trim()
  if (!CHANNEL_VOICE_SIGNAL_TYPES.has(type)) {
    throw new ValidationError('Invalid voice signal type')
  }

  if (type === 'offer' || type === 'answer') {
    const sdp = String(input.sdp || '')
    if (!sdp.trim()) {
      throw new ValidationError('voice signal SDP is required')
    }
    return { type, sdp }
  }

  if (
    !input.candidate ||
    typeof input.candidate !== 'object' ||
    Array.isArray(input.candidate)
  ) {
    throw new ValidationError('voice signal candidate is required')
  }

  const candidate = {
    candidate: String(input.candidate.candidate || ''),
    sdpMid:
      input.candidate.sdpMid === null || input.candidate.sdpMid === undefined
        ? null
        : String(input.candidate.sdpMid),
    sdpMLineIndex:
      input.candidate.sdpMLineIndex === null ||
      input.candidate.sdpMLineIndex === undefined
        ? null
        : Number(input.candidate.sdpMLineIndex),
  }
  if (
    input.candidate.usernameFragment !== null &&
    input.candidate.usernameFragment !== undefined
  ) {
    candidate.usernameFragment = String(input.candidate.usernameFragment)
  }

  return {
    type,
    candidate,
  }
}

export function normalizeChannelVoiceEvent(
  channelInput,
  input = {},
  options = {}
) {
  const channelId = normalizeChannelId(channelInput)
  if (!channelId) {
    throw new ValidationError('voice channel is required')
  }

  const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
  const inputSender =
    input.sender &&
    typeof input.sender === 'object' &&
    !Array.isArray(input.sender)
      ? input.sender
      : {}
  const senderAddress =
    ownerAddress || normalizeOwnerAddress(inputSender.address)
  if (!senderAddress) {
    throw new ValidationError('voice sender is required')
  }

  const event = String(input.event || '').trim()
  if (!CHANNEL_VOICE_EVENTS.has(event)) {
    throw new ValidationError('Invalid voice event')
  }

  const sessionId = normalizeSessionId(input.sessionId)
  const channelKey = buildChannelKey(channelId)
  const normalized = {
    channel: channelKey,
    channelKey,
    channelId,
    event,
    sessionId,
    sender: {
      address: senderAddress,
    },
    timestamp: Number(options.timestamp) || Date.now(),
  }

  const displayName = normalizeChannelDisplayName(
    input.displayName ?? inputSender.displayName,
    senderAddress
  )
  if (displayName) normalized.sender.displayName = displayName

  const avatar = normalizeChannelAvatar(input.avatar ?? inputSender.avatar)
  if (avatar) normalized.sender.avatar = avatar

  const profileUpdatedAt = Number(
    input.profileUpdatedAt ?? inputSender.profileUpdatedAt
  )
  if (Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0) {
    normalized.sender.profileUpdatedAt = profileUpdatedAt
  }

  if (input.micMuted !== undefined) {
    normalized.micMuted = Boolean(input.micMuted)
  }

  if (event === 'signal') {
    normalized.targetSessionId = normalizeSessionId(
      input.targetSessionId,
      'voice target session'
    )
    normalized.signal = normalizeSignal(input.signal)
  } else if (input.targetSessionId) {
    normalized.targetSessionId = normalizeSessionId(
      input.targetSessionId,
      'voice target session'
    )
  }

  assertPayloadSize(normalized, 'voice event is too large')
  return normalized
}
