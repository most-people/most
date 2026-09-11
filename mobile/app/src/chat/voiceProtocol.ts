import type { MobileIdentity } from '../mobileCore/types'

export type VoiceEventName = 'join' | 'state' | 'heartbeat' | 'leave' | 'signal'

export type VoiceSignalType = 'offer' | 'answer' | 'candidate'

export type VoiceSignal = {
  type: VoiceSignalType
  sdp?: string
  candidate?: Record<string, unknown>
}

export type VoiceProfile = {
  displayName?: string
  avatar?: string
  profileUpdatedAt?: number
}

export type VoiceParticipant = VoiceProfile & {
  sessionId: string
  address: string
  micMuted: boolean
  joinedAt: number
  lastSeen: number
  local: boolean
}

export type VoiceEvent = {
  channel: string
  event: VoiceEventName
  sessionId: string
  targetSessionId?: string
  sender?: VoiceProfile & { address: string }
  micMuted?: boolean
  signal?: VoiceSignal
  timestamp: number
}

export type VoiceRoomState = {
  channel: string
  participants: Record<string, VoiceParticipant>
}

const EVENT_NAMES = new Set<VoiceEventName>([
  'join',
  'state',
  'heartbeat',
  'leave',
  'signal',
])
const SIGNAL_TYPES = new Set<VoiceSignalType>(['offer', 'answer', 'candidate'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function createVoiceSessionId(random = Math.random) {
  return `voice-${Date.now()}-${Math.floor(random() * 0xffffffff).toString(36)}`
}

export function buildVoiceEventFrame(
  channel: string,
  event: VoiceEventName,
  input: {
    sessionId: string
    profile?: VoiceProfile
    micMuted?: boolean
    targetSessionId?: string
    signal?: VoiceSignal
  }
) {
  const normalizedChannel = string(channel)
  const sessionId = string(input.sessionId)
  if (!normalizedChannel) throw new Error('channel is required')
  if (!sessionId) throw new Error('sessionId is required')
  if (!EVENT_NAMES.has(event)) throw new Error('invalid voice event')
  const data = {
    channel: normalizedChannel,
    event,
    sessionId,
    ...(input.profile?.displayName
      ? { displayName: input.profile.displayName }
      : {}),
    ...(input.profile?.avatar ? { avatar: input.profile.avatar } : {}),
    ...(input.profile?.profileUpdatedAt === undefined
      ? {}
      : { profileUpdatedAt: input.profile.profileUpdatedAt }),
    ...(input.micMuted === undefined ? {} : { micMuted: input.micMuted }),
    ...(input.targetSessionId
      ? { targetSessionId: input.targetSessionId }
      : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  }
  return JSON.stringify({ event: `channel:voice:${event}`, data })
}

export function parseVoiceWebSocketMessage(raw: string): VoiceEvent | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const outer = record(value)
  const outerEvent = string(outer.event)
  if (
    outerEvent !== 'channel:voice' &&
    !outerEvent.startsWith('channel:voice:')
  )
    return null
  const data = record(outer.data)
  const channel = string(data.channelKey || data.channel || data.channelId)
  const event = (string(data.event) ||
    outerEvent.slice('channel:voice:'.length)) as VoiceEventName
  const sessionId = string(data.sessionId)
  if (!channel || !sessionId || !EVENT_NAMES.has(event)) return null
  const senderRecord = record(data.sender)
  const senderAddress = string(senderRecord.address || data.address)
  const signalRecord = record(data.signal)
  const signalType = string(signalRecord.type) as VoiceSignalType
  const signal = SIGNAL_TYPES.has(signalType)
    ? {
        type: signalType,
        ...(string(signalRecord.sdp) ? { sdp: string(signalRecord.sdp) } : {}),
        ...(signalRecord.candidate && typeof signalRecord.candidate === 'object'
          ? { candidate: record(signalRecord.candidate) }
          : {}),
      }
    : undefined
  const timestamp = Number(data.timestamp)
  return {
    channel,
    event,
    sessionId,
    ...(string(data.targetSessionId)
      ? { targetSessionId: string(data.targetSessionId) }
      : {}),
    ...(senderAddress
      ? {
          sender: {
            address: senderAddress,
            ...(string(senderRecord.displayName || data.displayName)
              ? {
                  displayName: string(
                    senderRecord.displayName || data.displayName
                  ),
                }
              : {}),
            ...(string(senderRecord.avatar || data.avatar)
              ? { avatar: string(senderRecord.avatar || data.avatar) }
              : {}),
            ...(Number.isFinite(Number(senderRecord.profileUpdatedAt))
              ? { profileUpdatedAt: Number(senderRecord.profileUpdatedAt) }
              : {}),
          },
        }
      : {}),
    ...(typeof data.micMuted === 'boolean' ? { micMuted: data.micMuted } : {}),
    ...(signal ? { signal } : {}),
    timestamp:
      Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
  }
}

export function reduceVoiceEvent(
  state: VoiceRoomState,
  event: VoiceEvent,
  localSessionId = ''
): VoiceRoomState {
  if (event.channel !== state.channel || event.sessionId === localSessionId)
    return state
  const current = state.participants[event.sessionId]
  if (event.event === 'leave') {
    if (!current) return state
    const participants = { ...state.participants }
    delete participants[event.sessionId]
    return { ...state, participants }
  }
  const sender = event.sender
  if (!sender?.address && !current) return state
  const participant: VoiceParticipant = {
    sessionId: event.sessionId,
    address: sender?.address || current?.address || '',
    displayName:
      sender?.displayName ||
      current?.displayName ||
      sender?.address ||
      event.sessionId,
    ...(sender?.avatar || current?.avatar
      ? { avatar: sender?.avatar || current?.avatar }
      : {}),
    ...(sender?.profileUpdatedAt || current?.profileUpdatedAt
      ? {
          profileUpdatedAt:
            sender?.profileUpdatedAt || current?.profileUpdatedAt,
        }
      : {}),
    micMuted:
      typeof event.micMuted === 'boolean'
        ? event.micMuted
        : current?.micMuted || false,
    joinedAt: current?.joinedAt || event.timestamp,
    lastSeen: event.timestamp,
    local: false,
  }
  return {
    ...state,
    participants: { ...state.participants, [event.sessionId]: participant },
  }
}

export function createVoiceRoomState(
  channel: string,
  localSessionId?: string,
  localAddress?: string,
  profile: VoiceProfile = {}
): VoiceRoomState {
  const normalized = string(channel)
  if (!normalized) throw new Error('channel is required')
  if (!localSessionId || !localAddress)
    return { channel: normalized, participants: {} }
  const now = Date.now()
  return {
    channel: normalized,
    participants: {
      [localSessionId]: {
        ...profile,
        sessionId: localSessionId,
        address: localAddress,
        micMuted: false,
        joinedAt: now,
        lastSeen: now,
        local: true,
      },
    },
  }
}

export type VoiceWebSocketSessionOptions = {
  baseUrl: string
  invite: string
  identity: MobileIdentity | null
  channel: string
  sessionId?: string
  profile?: VoiceProfile
  webSocketFactory?: (url: string) => VoiceSocket
  onEvent?: (event: VoiceEvent) => void
}

export type VoiceSocket = {
  readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
  send(data: string): void
  close(): void
}

const OPEN = 1

/** Voice signaling transport. Audio capture/playback is provided by a future native adapter. */
export class VoiceWebSocketSession {
  #options: VoiceWebSocketSessionOptions
  #socket: VoiceSocket | null = null
  #joined = false
  #muted = false
  #started = false
  readonly sessionId: string

  constructor(options: VoiceWebSocketSessionOptions) {
    this.#options = options
    this.sessionId = options.sessionId || createVoiceSessionId()
  }

  get connected() {
    return this.#socket?.readyState === OPEN
  }

  async connect() {
    if (this.connected) return
    const { buildAuthenticatedWebSocketUrl } =
      await import('../remoteNode/protocol')
    const url = await buildAuthenticatedWebSocketUrl(this.#options)
    const factory =
      this.#options.webSocketFactory ||
      (value => new WebSocket(value) as unknown as VoiceSocket)
    this.#started = true
    await new Promise<void>((resolve, reject) => {
      const socket = factory(url)
      let settled = false
      this.#socket = socket
      socket.onopen = () => {
        settled = true
        socket.send(
          JSON.stringify({
            event: 'channel:subscribe',
            data: { channel: this.#options.channel },
          })
        )
        if (this.#joined) this.#send('join')
        resolve()
      }
      socket.onmessage = event => {
        const parsed = parseVoiceWebSocketMessage(String(event.data))
        if (parsed) this.#options.onEvent?.(parsed)
      }
      socket.onerror = () => {
        if (!settled) {
          settled = true
          reject(new Error('Voice WebSocket is unreachable'))
        }
      }
      socket.onclose = () => {
        if (!settled) {
          settled = true
          reject(new Error('Voice WebSocket closed before connecting'))
        }
        if (this.#socket === socket) this.#socket = null
      }
    })
  }

  async join() {
    await this.connect()
    this.#joined = true
    this.#send('join')
  }

  setMuted(muted: boolean) {
    this.#muted = muted
    if (this.#joined) this.#send('state')
  }

  heartbeat() {
    if (this.#joined) this.#send('heartbeat')
  }

  sendSignal(targetSessionId: string, signal: VoiceSignal) {
    if (!targetSessionId || !signal) return
    this.#send('signal', { targetSessionId, signal })
  }

  leave() {
    if (this.#joined) this.#send('leave')
    this.#joined = false
  }

  close() {
    this.leave()
    this.#started = false
    const socket = this.#socket
    this.#socket = null
    socket?.close()
  }

  #send(
    event: VoiceEventName,
    extra: { targetSessionId?: string; signal?: VoiceSignal } = {}
  ) {
    if (!this.connected || !this.#socket) return
    this.#socket.send(
      buildVoiceEventFrame(this.#options.channel, event, {
        sessionId: this.sessionId,
        profile: this.#options.profile,
        micMuted: this.#muted,
        ...extra,
      })
    )
  }
}
