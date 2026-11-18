// Ephemeral v2 presence validation (signatures.md §4.3). Keep in sync with
// server/src/core/channelSignedPresence.js; both use the same vectors.
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
