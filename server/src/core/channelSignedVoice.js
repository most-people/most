import { verifySignedEnvelope } from './chatSignaturesV2.js'

export const VOICE_FRAME_LIMIT = 64 * 1024
const SESSION = /^[a-zA-Z0-9_-]{3,80}$/
const events = new Set(['join', 'state', 'heartbeat', 'leave', 'signal'])
const sessionId = value => typeof value === 'string' && SESSION.test(value)

export function voiceFrame({ body, cert, device, sig } = {}) {
  return { v: 2, type: 'channel-voice', body, cert, device, sig }
}

export function voiceFrameError(
  frame,
  { channelId, author, event, now = Date.now() }
) {
  if (frame?.v !== 2 || frame.type !== 'channel-voice')
    return 'invalid voice frame'
  if (Buffer.byteLength(JSON.stringify(frame)) > VOICE_FRAME_LIMIT)
    return 'voice frame is too large'
  const result = verifySignedEnvelope(frame, { channelId })
  if (!result.ok) return result.error
  const { body } = frame
  if (
    body.kind !== 'voice' ||
    !events.has(body.event) ||
    (event !== undefined && body.event !== event)
  )
    return 'invalid voice event'
  if (author !== undefined && body.author !== author)
    return 'voice author mismatch'
  if (Math.abs(body.createdAt - now) > 120000) return 'stale voice event'
  if (!sessionId(body.sessionId)) return 'invalid voice session'
  if (body.event === 'signal') {
    if (
      !sessionId(body.targetSessionId) ||
      typeof body.transport !== 'string' ||
      !body.transport.trim() ||
      !body.signal ||
      typeof body.signal !== 'object' ||
      Array.isArray(body.signal)
    )
      return 'invalid directed signal'
  } else if (Object.hasOwn(body, 'signal')) return 'signal must be directed'
  return ''
}

// Only an active session's original connection and signing device may update
// its route. Targets are looked up within the same channel.
export class VoiceRoutes {
  #sessions = new Map()

  accept(frame, source, now = Date.now()) {
    for (const [key, session] of this.#sessions) {
      if (now - session.seen >= 45000) this.#sessions.delete(key)
    }
    const { body, device } = frame
    const key = body.channelId + ':' + body.sessionId
    const current = this.#sessions.get(key)
    if (
      current &&
      (current.source !== source ||
        current.device !== device ||
        current.author !== body.author)
    )
      return null
    if (body.event === 'leave') this.#sessions.delete(key)
    else
      this.#sessions.set(key, {
        source,
        device,
        author: body.author,
        seen: now,
      })
    if (body.event !== 'signal') return { broadcast: true }
    const target = this.#sessions.get(
      body.channelId + ':' + body.targetSessionId
    )
    return target ? { target: target.source } : null
  }

  clearSource(source) {
    for (const [key, session] of this.#sessions) {
      if (session.source === source) this.#sessions.delete(key)
    }
  }

  clear() {
    this.#sessions.clear()
  }
}

// The authenticated WebSocket API exposes this projection, while the swarm
// carries the original device-signed body unchanged.
export function voiceEvent({ body }) {
  return {
    channel: body.channelId,
    channelKey: body.channelId,
    channelId: body.channelId,
    event: body.event,
    sessionId: body.sessionId,
    timestamp: body.createdAt,
    sender: {
      address: body.author,
      displayName: body.displayName,
      avatar: body.avatar,
      profileUpdatedAt: body.profileUpdatedAt,
    },
    micMuted: body.micMuted,
    ...(body.event === 'signal'
      ? {
          targetSessionId: body.targetSessionId,
          transport: body.transport,
          signal: body.signal,
        }
      : {}),
  }
}
