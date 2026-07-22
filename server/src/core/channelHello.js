function getChannelId(channel) {
  return String(
    channel?.channelId || channel?.channelKey || channel?.name || ''
  ).trim()
}

function isLegacyDirectChannel(channelId, type = '') {
  return (
    /^direct(?:-inbox)?\./.test(channelId) ||
    type === 'direct' ||
    type === 'direct-inbox'
  )
}

export function selectChannelsForHello(channels = []) {
  return channels.filter(channel => {
    const channelId = getChannelId(channel)
    const type = String(channel?.type || '').trim()
    return channelId && !isLegacyDirectChannel(channelId, type)
  })
}

export function isChannelAllowedForConnection(channelIdInput) {
  const channelId = String(channelIdInput || '').trim()
  return Boolean(channelId) && !isLegacyDirectChannel(channelId)
}
