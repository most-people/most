import type { MobileIdentity } from '../mobileCore/types'
import { buildAuthenticatedWebSocketUrl } from '../remoteNode/protocol'
import {
  buildChannelSubscribeFrame,
  buildChannelUnsubscribeFrame,
  parseChatWebSocketMessage,
  type ChatWebSocketEvent,
} from './chatProtocol'

export type ChatSocket = {
  readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
  send(data: string): void
  close(): void
}

export type ChatWebSocketSessionOptions = {
  baseUrl: string
  invite: string
  identity: MobileIdentity | null
  onEvent?: (event: ChatWebSocketEvent) => void
  onConnectionChange?: (connected: boolean) => void
  webSocketFactory?: (url: string) => ChatSocket
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
  connectionTimeoutMs?: number
}

const OPEN = 1

/** Authenticated channel WebSocket with subscription replay after reconnect. */
export class ChatWebSocketSession {
  #options: ChatWebSocketSessionOptions
  #socket: ChatSocket | null = null
  #channels = new Set<string>()
  #started = false
  #connecting: Promise<void> | null = null
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #reconnectAttempts = 0
  #generation = 0
  #cancelOpen: (() => void) | null = null

  constructor(options: ChatWebSocketSessionOptions) {
    this.#options = options
  }

  get connected() {
    return this.#socket?.readyState === OPEN
  }

  get channels() {
    return [...this.#channels]
  }

  async connect() {
    this.#started = true
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
    if (this.connected) return
    if (this.#connecting) return this.#connecting
    const connecting = this.#open()
    this.#connecting = connecting
    try {
      await connecting
    } finally {
      if (this.#connecting === connecting) this.#connecting = null
    }
  }

  async subscribe(channel: string) {
    const normalized = String(channel || '').trim()
    if (!normalized) throw new Error('channel is required')
    const wasConnected = this.connected
    this.#channels.add(normalized)
    await this.connect()
    if (wasConnected) this.#send(buildChannelSubscribeFrame(normalized))
  }

  unsubscribe(channel: string) {
    const normalized = String(channel || '').trim()
    if (!normalized) return
    this.#channels.delete(normalized)
    if (this.connected) this.#send(buildChannelUnsubscribeFrame(normalized))
  }

  close() {
    this.#started = false
    this.#generation += 1
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null
    this.#connecting = null
    const socket = this.#socket
    this.#socket = null
    this.#cancelOpen?.()
    this.#cancelOpen = null
    socket?.close()
    this.#options.onConnectionChange?.(false)
  }

  async #open() {
    const generation = this.#generation
    this.#options.onConnectionChange?.(false)
    const url = await buildAuthenticatedWebSocketUrl({
      baseUrl: this.#options.baseUrl,
      invite: this.#options.invite,
      identity: this.#options.identity,
    })
    if (!this.#started || generation !== this.#generation)
      throw new Error('Chat session closed before connecting')
    const factory =
      this.#options.webSocketFactory ||
      ((value: string) => new WebSocket(value) as unknown as ChatSocket)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let retired = false
      const socket = factory(url)
      this.#socket = socket
      const isCurrent = () =>
        !retired &&
        this.#started &&
        generation === this.#generation &&
        this.#socket === socket
      const finish = (message: string, reconnect: boolean) => {
        if (retired) return
        retired = true
        clearTimeout(timer)
        if (this.#cancelOpen === cancel) this.#cancelOpen = null
        if (this.#socket === socket) this.#socket = null
        if (!settled) {
          settled = true
          reject(new Error(message))
        }
        socket.close()
        if (reconnect && this.#started && generation === this.#generation) {
          this.#options.onConnectionChange?.(false)
          this.#scheduleReconnect()
        }
      }
      const cancel = () =>
        finish('Chat session closed before connecting', false)
      const timer = setTimeout(
        () => finish('Chat WebSocket connection timed out', true),
        Math.max(1, this.#options.connectionTimeoutMs ?? 15_000)
      )
      this.#cancelOpen = cancel
      socket.onopen = () => {
        if (!isCurrent()) return
        settled = true
        clearTimeout(timer)
        if (this.#cancelOpen === cancel) this.#cancelOpen = null
        this.#reconnectAttempts = 0
        for (const channel of this.#channels) {
          this.#send(buildChannelSubscribeFrame(channel))
        }
        this.#options.onConnectionChange?.(true)
        resolve()
      }
      socket.onmessage = event => {
        if (!isCurrent()) return
        const parsed = parseChatWebSocketMessage(String(event.data))
        if (parsed) this.#options.onEvent?.(parsed)
      }
      socket.onerror = () => {
        if (isCurrent()) finish('Chat WebSocket is unreachable', true)
      }
      socket.onclose = () => {
        if (isCurrent()) finish('Chat WebSocket closed before connecting', true)
      }
    })
  }

  #send(frame: string) {
    if (!this.connected || !this.#socket) return
    this.#socket.send(frame)
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer || !this.#started) return
    const base = Math.max(1, this.#options.reconnectBaseDelayMs ?? 500)
    const max = Math.max(base, this.#options.reconnectMaxDelayMs ?? 10_000)
    const delay = Math.min(base * 2 ** this.#reconnectAttempts, max)
    this.#reconnectAttempts += 1
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      void this.connect().catch(() => this.#scheduleReconnect())
    }, delay)
  }
}
