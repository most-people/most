// Signed entries in a channel writer core (docs/protocol/v2/signatures.md §4).
// Same rules as the desktop engine (server/src/core/channelSignedEntry.js):
// whether an entry is shown depends only on the signature and the shared
// readableBodyError, so both cores show the same messages.
import { canonicalJson } from '../shared/canonical-json.mjs'
import { readableBodyError } from '../shared/chat-signing.mjs'
import { normalizeChannelAttachment } from './channel-protocol.mjs'
import { verifySignedEnvelope } from './chat-signatures-v2.mjs'

export const SIGNED_ENTRY_TYPE = 'signed'
/** Remote `ts` beyond this does not move the local clock (§4.5). */
export const SIGNED_TS_FUTURE_LIMIT_MS = 5 * 60 * 1000

function sameJson(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right)
  } catch {
    return false
  }
}

function attachmentOf(body) {
  if (!Object.hasOwn(body, 'attachment')) return null
  const attachment = normalizeChannelAttachment(body.attachment)
  return attachment &&
    sameJson(attachment, body.attachment) &&
    body.content === attachment.link
    ? attachment
    : undefined
}

export function isSignedEntry(entry) {
  return entry?.type === SIGNED_ENTRY_TYPE && entry?.v === 2
}

/** Reason this core refuses to write a client's signed message, or ''. */
export function signedMessageError(envelope, { channelId } = {}) {
  const verified = verifySignedEnvelope(envelope, { channelId })
  if (!verified.ok) return verified.error
  const { body } = envelope
  if (body.kind !== 'message') return 'expected a message body'
  const error = readableBodyError(body)
  if (error) return error
  if (body.content !== body.content.trim()) return 'content must be trimmed'
  if (attachmentOf(body) === undefined) return 'invalid attachment'
  return ''
}

/** The writer core block for a verified envelope and its sort time. */
export function buildSignedEntry({ body, device, cert, sig }, ts) {
  return { v: 2, type: SIGNED_ENTRY_TYPE, ts, body, device, cert, sig }
}

/** The message shape of a shown signed `message` entry, or null. */
export function readSignedMessageEntry(entry, channelId) {
  if (!isSignedEntry(entry)) return null
  if (!Number.isSafeInteger(entry.ts) || entry.ts <= 0) return null
  if (!verifySignedEnvelope(entry, { channelId }).ok) return null
  const { body } = entry
  if (body.kind !== 'message' || readableBodyError(body)) return null
  const authorName =
    typeof body.authorName === 'string' ? body.authorName.trim() : ''
  const attachment = attachmentOf(body)
  return {
    type: 'message',
    author: body.author,
    authorName: authorName || body.author.slice(0, 10),
    content: body.content,
    timestamp: entry.ts,
    clientMessageId: body.id,
    ...(attachment ? { attachment } : {}),
  }
}
