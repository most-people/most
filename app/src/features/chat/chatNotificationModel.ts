import {
  getChatMessageKey,
  getChatMessageTimestamp,
  isOwnChatMessage,
  mergeChatMessages,
  normalizeChatChannel,
  type ChatMessage,
} from '../../chat/chatProtocol'

type ChannelCursor = { keys: Set<string> }

/** Tracks messages observed during this session, without replaying old history. */
export class ChatNotificationCursor {
  #startedAt: number
  #channels = new Map<string, ChannelCursor>()

  constructor(startedAt = Date.now()) {
    this.#startedAt = startedAt
  }

  observe(input: {
    channels: string[]
    messages: Record<string, ChatMessage[]>
    ownAddress: string
    hidden: string[]
    enabled: boolean
    foreground: boolean
  }): string[] {
    const joined = new Set(input.channels)
    for (const name of this.#channels.keys()) {
      if (!joined.has(name)) this.#channels.delete(name)
    }
    const notifications: string[] = []
    for (const name of joined) {
      if (!Object.hasOwn(input.messages, name)) continue
      const messages = mergeChatMessages(input.messages[name]).filter(
        message => message.type !== 'system'
      )
      const previous = this.#channels.get(name)
      const newMessages = previous
        ? messages.filter(message => {
            const timestamp = getChatMessageTimestamp(message)
            return (
              timestamp >= this.#startedAt &&
              !previous.keys.has(getChatMessageKey(message)) &&
              !isOwnChatMessage(message, input.ownAddress)
            )
          })
        : []
      const keys = new Set(previous?.keys || [])
      for (const message of messages) {
        keys.add(getChatMessageKey(message))
      }
      // Retain more than the latest history page while bounding long sessions.
      this.#channels.set(name, { keys: new Set([...keys].slice(-1000)) })
      if (
        input.enabled &&
        !input.foreground &&
        !input.hidden.includes(name) &&
        newMessages.length
      )
        notifications.push(name)
    }
    return notifications
  }
}

export function getNotificationChannel(
  data: unknown,
  scope: string,
  channels: string[]
) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  if (record.kind !== 'mostbox-chat' || record.scope !== scope) return null
  if (typeof record.channel !== 'string') return null
  const channel = normalizeChatChannel(record.channel)
  return channels.includes(channel) ? channel : null
}
