import { buildChannelKey, normalizeChannelId } from './channelIdentity.js'
import { normalizeOwnerAddress } from './ownerMetadata.js'

const CHANNEL_PRESENCE_STATUSES = new Set([
  'online',
  'heartbeat',
  'profile',
  'offline',
])

export function createChannelPresenceMessage(peerId, event, now = Date.now()) {
  return {
    type: 'channel-presence',
    peerId,
    channelId: event.channelId,
    channelKey: event.channelKey,
    address: event.address,
    status: event.status,
    displayName: event.displayName,
    avatar: event.avatar,
    profileUpdatedAt: event.profileUpdatedAt,
    lastSeen: event.lastSeen || now,
    sessionId: event.sessionId || 'default',
  }
}

export function createChannelVoiceMessage(peerId, event) {
  return {
    type: 'channel-voice',
    peerId,
    ...event,
  }
}

export function normalizeRemoteChannelFrame(message, localPeerId, type) {
  if (message?.type !== type) return null
  const peerId = String(message.peerId || '').trim()
  if (!peerId || peerId === localPeerId) return null
  const channelId = normalizeChannelId(message.channelId || message.channelKey)
  return {
    peerId,
    channelId,
    channelKey: buildChannelKey(channelId),
  }
}

export function normalizeRemoteChannelPresence(
  message,
  localPeerId,
  now = Date.now()
) {
  const context = normalizeRemoteChannelFrame(
    message,
    localPeerId,
    'channel-presence'
  )
  if (!context) return null

  const address = normalizeOwnerAddress(message.address)
  const status = String(message.status || '').trim()
  if (!address || !CHANNEL_PRESENCE_STATUSES.has(status)) return null

  return {
    ...context,
    status,
    options: {
      address,
      sessionId: message.sessionId,
      sourcePeerId: context.peerId,
      local: false,
      displayName: message.displayName,
      avatar: message.avatar,
      profileUpdatedAt: message.profileUpdatedAt,
      lastSeen: Number(message.lastSeen) || now,
    },
  }
}
