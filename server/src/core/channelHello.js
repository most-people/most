import {
  DIRECT_CHANNEL_TYPE,
  DIRECT_INBOX_CHANNEL_TYPE,
  getDirectSystemChannelType,
} from './directChat.js'

function getChannelId(channel) {
  return String(
    channel?.channelId || channel?.channelKey || channel?.name || ''
  ).trim()
}

export function selectChannelsForHello(
  channels = [],
  authorizedDirectChannelIds = []
) {
  const authorized =
    authorizedDirectChannelIds instanceof Set
      ? authorizedDirectChannelIds
      : new Set(authorizedDirectChannelIds)

  return channels.filter(channel => {
    const channelId = getChannelId(channel)
    const type = String(channel?.type || '').trim()
    const directType = getDirectSystemChannelType(channelId)
    const claimsDirect =
      type === DIRECT_CHANNEL_TYPE || type === DIRECT_INBOX_CHANNEL_TYPE

    if (!directType) return !claimsDirect
    return type === directType && authorized.has(channelId)
  })
}

export function isChannelAllowedForConnection(
  channelIdInput,
  authorizedDirectChannelIds = []
) {
  const channelId = String(channelIdInput || '').trim()
  if (!getDirectSystemChannelType(channelId)) return true
  const authorized =
    authorizedDirectChannelIds instanceof Set
      ? authorizedDirectChannelIds
      : new Set(authorizedDirectChannelIds)
  return authorized.has(channelId)
}
