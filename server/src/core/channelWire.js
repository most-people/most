import { buildChannelKey, normalizeChannelId } from './channelIdentity.js'

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
