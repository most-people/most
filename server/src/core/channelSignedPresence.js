// Ephemeral v2 presence validation (signatures.md §4.3). This is separate
// from the v1 presence wire path until both clients can sign every update.
import { verifySignedEnvelope } from './chatSignaturesV2.js'

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
