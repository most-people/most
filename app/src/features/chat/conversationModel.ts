import { normalizeChatChannel } from '../../chat/chatProtocol'

export type JoinedChannel = { name: string; remark: string; pinned: boolean }

export function getJoinedChannels(
  channels: Array<{
    channelKey?: unknown
    channelId?: unknown
    name?: unknown
    remark?: unknown
    pinned?: unknown
  }>
): JoinedChannel[] {
  const result = new Map<string, JoinedChannel>()
  for (const channel of channels) {
    const key = channel.channelKey || channel.channelId || channel.name
    const name = typeof key === 'string' ? normalizeChatChannel(key) : ''
    if (!name || result.has(name)) continue
    result.set(name, {
      name,
      remark: typeof channel.remark === 'string' ? channel.remark : '',
      pinned: channel.pinned === true,
    })
  }
  return [...result.values()].sort(
    (left, right) => Number(right.pinned) - Number(left.pinned)
  )
}

export function getJoinedChannelNames(
  channels: Array<{ channelKey?: string; channelId?: string; name?: string }>
) {
  return getJoinedChannels(channels).map(channel => channel.name)
}

export function normalizeHiddenConversations(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeChatChannel)
        .filter(Boolean)
    ),
  ]
}

export function getVisibleConversations(joined: string[], hidden: string[]) {
  return joined.filter(channel => !hidden.includes(channel))
}
