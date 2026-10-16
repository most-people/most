import {
  getChatMessageTimestamp,
  isOwnChatMessage,
  mergeChatMessages,
  normalizeChatChannel,
  type ChatMessage,
} from '../../chat/chatProtocol'

// Messages are rendered newest first; the separator belongs above the newer message.
export function shouldShowMessageTime(
  message: ChatMessage,
  older?: ChatMessage
) {
  const timestamp = getChatMessageTimestamp(message)
  if (!timestamp) return false
  const previous = older ? getChatMessageTimestamp(older) : 0
  return (
    !previous ||
    timestamp - previous >= 5 * 60 * 1000 ||
    new Date(timestamp).toDateString() !== new Date(previous).toDateString()
  )
}

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

export function getRemainingHiddenConversations(
  hidden: string[],
  messages: Record<string, ChatMessage[]>,
  state: ConversationState,
  ownAddress: string
) {
  return hidden.filter(name => {
    if (!Object.hasOwn(state.readAt, name) || !Object.hasOwn(messages, name))
      return true
    return !messages[name].some(
      message =>
        message.type !== 'system' &&
        !isOwnChatMessage(message, ownAddress) &&
        getChatMessageTimestamp(message) > state.readAt[name]
    )
  })
}

export type ConversationState = {
  drafts: Record<string, string>
  readAt: Record<string, number>
}

export function normalizeConversationState(value: unknown): ConversationState {
  const state =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const entries = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value)
      : []
  return {
    drafts: Object.fromEntries(
      entries(state.drafts)
        .filter(([name, draft]) => name && typeof draft === 'string' && draft)
        .map(([name, draft]) => [normalizeChatChannel(name), draft])
        .filter(([name]) => name)
    ),
    readAt: Object.fromEntries(
      entries(state.readAt)
        .filter(
          ([name, timestamp]) =>
            name &&
            typeof timestamp === 'number' &&
            Number.isFinite(timestamp) &&
            timestamp >= 0
        )
        .map(([name, timestamp]) => [normalizeChatChannel(name), timestamp])
        .filter(([name]) => name)
    ),
  }
}

export function getConversationDraft(
  state: ConversationState,
  channel: string
) {
  return Object.hasOwn(state.drafts, channel) ? state.drafts[channel] : ''
}

export function setConversationDraft(
  state: ConversationState,
  channel: string,
  draft: string
): ConversationState {
  const name = normalizeChatChannel(channel)
  if (!name || getConversationDraft(state, name) === draft) return state
  const drafts = { ...state.drafts, [name]: draft }
  if (!draft) delete drafts[name]
  return { ...state, drafts }
}

export function markConversationRead(
  state: ConversationState,
  channel: string,
  messages: ChatMessage[]
): ConversationState {
  const latest = messages.reduce(
    (timestamp, message) =>
      message.type === 'system'
        ? timestamp
        : Math.max(timestamp, getChatMessageTimestamp(message)),
    0
  )
  const previous = Object.hasOwn(state.readAt, channel)
    ? state.readAt[channel]
    : -1
  if (previous >= latest) return state
  return { ...state, readAt: { ...state.readAt, [channel]: latest } }
}

export type ConversationSummary = JoinedChannel & {
  draft: string
  lastMessage?: ChatMessage
  lastMessageAt: number
  unread: number
}

export function getConversationSummaries(
  channels: JoinedChannel[],
  messages: Record<string, ChatMessage[]>,
  state: ConversationState,
  ownAddress: string,
  hidden: string[] = [],
  query = ''
): ConversationSummary[] {
  const search = normalizeChatChannel(query)
  return channels
    .filter(channel => !hidden.includes(channel.name))
    .map(channel => {
      const history = Object.hasOwn(messages, channel.name)
        ? mergeChatMessages(messages[channel.name]).filter(
            message => message.type !== 'system'
          )
        : []
      const lastMessage = history.at(-1)
      const lastRead = Object.hasOwn(state.readAt, channel.name)
        ? state.readAt[channel.name]
        : null
      return {
        ...channel,
        draft: getConversationDraft(state, channel.name),
        lastMessage,
        lastMessageAt: lastMessage ? getChatMessageTimestamp(lastMessage) : 0,
        unread:
          lastRead === null
            ? 0
            : history.filter(
                message =>
                  !isOwnChatMessage(message, ownAddress) &&
                  getChatMessageTimestamp(message) > lastRead
              ).length,
      }
    })
    .filter(
      channel =>
        !search ||
        `${channel.name} ${channel.remark} ${channel.lastMessage?.content || ''} ${channel.lastMessage?.attachment?.fileName || ''}`
          .toLocaleLowerCase()
          .includes(search)
    )
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.lastMessageAt - left.lastMessageAt
    )
}
