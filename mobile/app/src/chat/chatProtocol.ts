import { CID } from 'multiformats/cid'
import type { MobileIdentity } from '../mobileCore/types'
import { buildRemoteApiUrl, buildRemoteHeaders } from '../remoteNode/protocol'
import { parseMostLink } from '../mobileCore/protocol'

export type ChatAttachment = {
  kind: 'file' | 'image'
  cid: string
  fileName: string
  link: string
  mimeType?: string
  size?: number
}

export type ChatMention = {
  address: string
  label: string
  start: number
  end: number
}

export type ChatMessage = {
  id?: string
  clientMessageId?: string
  channel?: string
  type?: string
  event?: string
  content: string
  author: string
  authorName: string
  authorTag?: unknown
  avatar?: string
  timestamp?: number | string
  attachment?: ChatAttachment
  mentions?: ChatMention[]
  [key: string]: unknown
}

export type ChatHistoryPage = {
  messages: ChatMessage[]
  nextCursor: string | null
}

export type ChatWebSocketEvent =
  | { event: 'channel:subscribed'; channel: string }
  | { event: 'channel:message'; channel: string; message: ChatMessage }

export type ChatMessageInput = {
  content: string
  author: string
  authorName: string
  avatar?: string
  authorTag?: unknown
  attachment?: ChatAttachment | null
  mentions?: ChatMention[]
  clientMessageId?: string
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'string' ? String(value[key]) : ''
}

/** Return a UUID v4 suitable for retries of one logical send. */
export function createClientMessageId(randomUUID?: () => string) {
  const candidate =
    randomUUID?.() ||
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : '')
  if (UUID_V4.test(candidate)) return candidate.toLowerCase()
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
  )
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function normalizeClientMessageId(value?: string) {
  if (typeof value !== 'string' || !UUID_V4.test(value.trim())) {
    throw new Error('Invalid clientMessageId')
  }
  return value.trim().toLowerCase()
}

export function normalizeChatAttachment(value: unknown): ChatAttachment | null {
  if (value === undefined || value === null) return null
  const record = asRecord(value)
  const kind = readString(record, 'kind')
  const cid = readString(record, 'cid')
  const fileName = readString(record, 'fileName')
  const link = readString(record, 'link')
  if ((kind !== 'file' && kind !== 'image') || !cid || !fileName || !link) {
    throw new Error('Invalid chat attachment')
  }
  try {
    if (CID.parse(cid).version !== 1 || parseMostLink(link).cid !== cid) {
      throw new Error('Invalid attachment CID')
    }
  } catch {
    throw new Error('Invalid attachment CID')
  }
  const size = record.size === undefined ? undefined : Number(record.size)
  if (size !== undefined && (!Number.isSafeInteger(size) || size < 0)) {
    throw new Error('Invalid attachment size')
  }
  return {
    kind,
    cid,
    fileName,
    link,
    ...(typeof record.mimeType === 'string'
      ? { mimeType: record.mimeType }
      : {}),
    ...(size === undefined ? {} : { size }),
  }
}

export function buildChatMessagePayload(input: ChatMessageInput) {
  const content = String(input.content || '').trim()
  if (!content) throw new Error('content is required')
  if (content.length > 10_000) throw new Error('content is too long')
  if (!input.author || !input.authorName) {
    throw new Error('author and authorName are required')
  }
  const attachment = normalizeChatAttachment(input.attachment)
  if (attachment && content !== attachment.link) {
    throw new Error('attachment message content must equal attachment link')
  }
  const clientMessageId = input.clientMessageId
    ? normalizeClientMessageId(input.clientMessageId)
    : createClientMessageId()
  return {
    content,
    author: input.author,
    authorName: input.authorName,
    clientMessageId,
    ...(input.avatar === undefined ? {} : { avatar: input.avatar }),
    ...(input.authorTag === undefined ? {} : { authorTag: input.authorTag }),
    ...(attachment ? { attachment } : {}),
    ...(input.mentions === undefined ? {} : { mentions: input.mentions }),
  }
}

export function normalizeChatMessage(value: unknown): ChatMessage | null {
  const record = asRecord(value)
  const content = readString(record, 'content')
  const author = readString(record, 'author')
  const authorName = readString(record, 'authorName')
  if (!content || !author || !authorName) return null
  let attachment: ChatAttachment | null
  try {
    attachment = normalizeChatAttachment(record.attachment)
  } catch {
    return null
  }
  const clientMessageId = readString(record, 'clientMessageId')
  return {
    ...record,
    content,
    author,
    authorName,
    ...(clientMessageId && UUID_V4.test(clientMessageId)
      ? { clientMessageId: clientMessageId.toLowerCase() }
      : {}),
    ...(attachment ? { attachment } : {}),
  } as ChatMessage
}

export function parseChatHistoryResponse(value: unknown): ChatHistoryPage {
  const record = asRecord(value)
  const messages = Array.isArray(record.messages)
    ? record.messages
        .map(normalizeChatMessage)
        .filter((message): message is ChatMessage => message !== null)
    : []
  const nextCursor =
    record.nextCursor === null ? null : readString(record, 'nextCursor') || null
  return { messages, nextCursor }
}

export function parseChatWebSocketMessage(
  raw: string
): ChatWebSocketEvent | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const record = asRecord(value)
  const event = readString(record, 'event') || readString(record, 'type')
  const data = asRecord(record.data)
  if (event === 'channel:subscribed') {
    const channel = readString(data, 'channel')
    return channel ? { event, channel } : null
  }
  if (event !== 'channel:message') return null
  const channel = readString(data, 'channel')
  const message = normalizeChatMessage(data.message || data)
  return channel && message ? { event, channel, message } : null
}

export function buildChannelSubscribeFrame(channel: string) {
  return JSON.stringify({ event: 'channel:subscribe', data: { channel } })
}

export function buildChannelUnsubscribeFrame(channel: string) {
  return JSON.stringify({ event: 'channel:unsubscribe', data: { channel } })
}

function messageKey(message: ChatMessage) {
  if (message.clientMessageId)
    return `client:${message.author}:${message.clientMessageId}`
  if (message.id) return `id:${message.id}`
  return `legacy:${message.author}:${message.timestamp || ''}:${message.content}`
}

/** Merge history, HTTP responses and live events without duplicating retries. */
export function mergeChatMessages(...groups: ChatMessage[][]) {
  const merged = new Map<string, ChatMessage>()
  for (const group of groups) {
    for (const message of group) merged.set(messageKey(message), message)
  }
  return [...merged.values()].sort((left, right) => {
    const a = Number(left.timestamp) || 0
    const b = Number(right.timestamp) || 0
    return a - b
  })
}

export type ChatApiClientOptions = {
  baseUrl: string
  invite: string
  identity: MobileIdentity | null
  fetchImpl?: typeof fetch
}

export class ChatApiClient {
  #options: ChatApiClientOptions

  constructor(options: ChatApiClientOptions) {
    this.#options = options
  }

  async #request(method: string, path: string, body?: Record<string, unknown>) {
    const headers = await buildRemoteHeaders({
      baseUrl: this.#options.baseUrl,
      invite: this.#options.invite,
      identity: this.#options.identity,
      method,
      path,
    })
    if (body) headers['Content-Type'] = 'application/json'
    const response = await (this.#options.fetchImpl || fetch)(
      buildRemoteApiUrl(this.#options.baseUrl, path),
      { method, headers, body: body ? JSON.stringify(body) : undefined }
    )
    const text = await response.text()
    let payload: unknown = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {}
    if (!response.ok) {
      const record = asRecord(payload)
      const error = new Error(
        readString(record, 'error') || `HTTP ${response.status}`
      ) as Error & { code?: string }
      error.code = readString(record, 'code') || `HTTP_${response.status}`
      throw error
    }
    return payload
  }

  async createOrJoinChannel(input: {
    name: string
    type?: string
    displayName?: string
    avatar?: string
    tag?: unknown
  }) {
    const payload = await this.#request('POST', '/api/channels', input)
    return asRecord(payload)
  }

  async listChannels() {
    const payload = await this.#request('GET', '/api/channels')
    const record = asRecord(payload)
    const values = Array.isArray(payload)
      ? payload
      : Array.isArray(record.channels)
        ? record.channels
        : []
    return values.map(asRecord)
  }

  async getHistory(
    channel: string,
    options: { limit?: number; before?: string } = {}
  ) {
    const params = new URLSearchParams()
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    if (options.before) params.set('before', options.before)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return parseChatHistoryResponse(
      await this.#request(
        'GET',
        `/api/channels/${encodeURIComponent(channel)}/history${suffix}`
      )
    )
  }

  async sendMessage(channel: string, input: ChatMessageInput) {
    const payload = buildChatMessagePayload(input)
    const response = asRecord(
      await this.#request(
        'POST',
        `/api/channels/${encodeURIComponent(channel)}/messages`,
        payload
      )
    )
    const message = normalizeChatMessage(response.message)
    if (!message) throw new Error('Invalid chat message response')
    return message
  }
}
