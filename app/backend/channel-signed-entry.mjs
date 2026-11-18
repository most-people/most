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
  if (!isSignedEntry(entry) || entry.body?.kind !== 'message') return null
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

// Profile fields must already be in the desktop writer's normal form.
// Readers ignore individual noncanonical optional fields (signatures.md §4.2).
function validProfileTag(tag) {
  if (tag === null) return true
  if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return false
  const entries = Object.entries(tag)
  return (
    entries.length > 0 &&
    entries.length <= 16 &&
    entries.every(
      ([key, value]) =>
        (key === 'default' ||
          /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(key)) &&
        typeof value === 'string' &&
        !!value &&
        value.trim() === value &&
        value.normalize('NFC') === value &&
        !/[\p{Cc}\p{Cf}]/u.test(value) &&
        Array.from(value).length <= 50
    )
  )
}

const PROFILE_FIELDS = {
  displayName: value =>
    typeof value === 'string' &&
    !!value &&
    value === value.trim() &&
    value.length <= 50,
  avatar: value =>
    typeof value === 'string' && value === value.trim() && value.length <= 4096,
  tag: validProfileTag,
}

export function signedProfileError(envelope, { channelId, now = Date.now() }) {
  const result = verifySignedEnvelope(envelope, { channelId })
  if (!result.ok) return result.error
  const { body } = envelope
  if (body.kind !== 'profile') return 'expected a profile body'
  if (body.createdAt > now + SIGNED_TS_FUTURE_LIMIT_MS)
    return 'createdAt is too far ahead'
  for (const [field, valid] of Object.entries(PROFILE_FIELDS)) {
    if (Object.hasOwn(body, field) && !valid(body[field]))
      return 'invalid ' + field
  }
  return ''
}

export function readSignedProfileEntry(entry, channelId, now = Date.now()) {
  if (
    !isSignedEntry(entry) ||
    entry.body?.kind !== 'profile' ||
    !Number.isSafeInteger(entry.ts) ||
    entry.ts <= 0
  )
    return null
  const { body } = entry
  if (
    body.createdAt > now + SIGNED_TS_FUTURE_LIMIT_MS ||
    !verifySignedEnvelope(entry, { channelId }).ok
  )
    return null
  const profile = { address: body.author, profileUpdatedAt: body.createdAt }
  for (const [field, valid] of Object.entries(PROFILE_FIELDS)) {
    if (Object.hasOwn(body, field) && valid(body[field]))
      profile[field] = body[field]
  }
  return profile
}
