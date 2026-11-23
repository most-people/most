// Ephemeral v2 presence (signatures.md §4.3).
import { verifySignedEnvelope } from './chat-signatures-v2.mjs'

export const PRESENCE_FRESHNESS_MS = 2 * 60 * 1000

/** Checks a client-signed presence without rewriting its body. */
export function signedPresenceError(
  envelope,
  { channelId, author, status, now = Date.now() } = {}
) {
  const result = verifySignedEnvelope(envelope, { channelId })
  if (!result.ok) return result.error
  const { body } = envelope
  if (body.kind !== 'presence') return 'expected presence'
  if (author !== undefined && body.author !== author) return 'author mismatch'
  if (status !== undefined && body.status !== status) return 'status mismatch'
  if (!['online', 'heartbeat', 'profile', 'offline'].includes(body.status)) {
    return 'invalid presence status'
  }
  if (
    typeof body.sessionId !== 'string' ||
    !body.sessionId.trim() ||
    body.sessionId !== body.sessionId.trim() ||
    body.sessionId.length > 120
  ) {
    return 'invalid presence sessionId'
  }
  if (Math.abs(body.createdAt - now) > PRESENCE_FRESHNESS_MS) {
    return 'stale presence'
  }
  return ''
}

/** Unknown versions/types are ignored; signatures cover all body fields. */
export function readSignedPresenceFrame(frame, options = {}) {
  if (frame?.v !== 2 || frame.type !== 'channel-presence') return null
  if (signedPresenceError(frame, options)) return null
  return frame
}

/** Only these fields go on the wire. Routing and receipt time stay local. */
export function createSignedPresenceFrame({ body, device, cert, sig }) {
  return { v: 2, type: 'channel-presence', body, device, cert, sig }
}

export function presenceSession(body, sourceId) {
  const session = {
    address: body.author,
    sessionId: body.sessionId,
    sourceId,
    lastSeen: Date.now(),
  }
  if (typeof body.displayName === 'string')
    session.displayName = body.displayName
  if (typeof body.avatar === 'string') session.avatar = body.avatar
  if (
    Number.isSafeInteger(body.profileUpdatedAt) &&
    body.profileUpdatedAt > 0
  ) {
    session.profileUpdatedAt = body.profileUpdatedAt
  }
  return session
}
