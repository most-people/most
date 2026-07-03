export const CHANNEL_MEMBER_JOINED_EVENT = 'channel.member.joined'

export function isChannelMemberJoinedSystemMessage(message) {
  return (
    message?.type === 'system' &&
    message?.event === CHANNEL_MEMBER_JOINED_EVENT
  )
}

export function getChannelMessageKey(message) {
  const author = String(message?.author || '').trim().toLowerCase()
  if (isChannelMemberJoinedSystemMessage(message) && author) {
    return `system:${CHANNEL_MEMBER_JOINED_EVENT}:${author}`
  }

  return String(
    message?.id ||
      [
        message?.author || '',
        message?.timestamp || '',
        message?.content || '',
      ].join('-')
  )
}

export function dedupeChannelMessages(messages) {
  const seen = new Set()
  return messages.filter(message => {
    const key = getChannelMessageKey(message)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
