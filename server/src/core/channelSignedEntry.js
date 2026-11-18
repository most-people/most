// Signed entries in a channel writer core (docs/protocol/v2/signatures.md §4).
// The node appends what a client signed and never edits the body; readers
// verify every entry and turn the body into the message shape the API returns.
import { MAX_MESSAGE_LENGTH } from '../config.js'
import {
  normalizeChannelAvatar,
  normalizeChannelDisplayName,
} from './channelIdentity.js'
import { normalizeLocalizedChatTag } from '../utils/chatLabels.js'
import { canonicalJson } from './canonicalJson.js'
import { normalizeChannelAttachment } from './channelAttachment.js'
import { normalizeChannelMentionList } from './channelMessage.js'
import { readableBodyError } from './chatSigning.js'
import { verifySignedEnvelope } from './chatSignaturesV2.js'

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

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

// Optional fields a node writes only in normal form; a reader shows each one
// only if it is in normal form, without rejecting the entry over it.
const OPTIONAL_FIELD_CHECKS = {
  authorName: body =>
    typeof body.authorName === 'string' &&
    normalizeChannelDisplayName(body.authorName, body.author) ===
      body.authorName,
  avatar: body => normalizeChannelAvatar(body.avatar) === body.avatar,
  authorTag: body =>
    sameJson(normalizeLocalizedChatTag(body.authorTag), body.authorTag),
  attachment: body => {
    try {
      const attachment = normalizeChannelAttachment(body.attachment)
      return (
        sameJson(attachment, body.attachment) &&
        body.content === attachment.link
      )
    } catch {
      return false
    }
  },
  mentions: body => {
    try {
      const mentions = normalizeChannelMentionList(
        body.mentions,
        body.content,
        {
          strict: true,
          attachment: has(body, 'attachment') ? body.attachment : null,
        }
      )
      return sameJson(mentions, body.mentions)
    } catch {
      return false
    }
  },
}

/** Reason a `message` body a client sends is not acceptable, or '' (§4.2). */
export function messageBodyError(body) {
  const { content } = body
  if (typeof content !== 'string' || !content || content !== content.trim()) {
    return 'content must be non-empty trimmed text'
  }
  if (content.length > MAX_MESSAGE_LENGTH) return 'content is too long'
  for (const [field, check] of Object.entries(OPTIONAL_FIELD_CHECKS)) {
    if (has(body, field) && !check(body)) return `invalid ${field}`
  }
  return ''
}

/** Checks a signed `message` envelope; returns '' when acceptable. */
export function signedMessageError(envelope, { channelId } = {}) {
  const verified = verifySignedEnvelope(envelope, { channelId })
  if (!verified.ok) return verified.error
  if (envelope.body.kind !== 'message') return 'expected a message body'
  return messageBodyError(envelope.body)
}

/** The writer core block for a verified envelope and its sort time. */
export function buildSignedEntry({ body, device, cert, sig }, ts) {
  return { v: 2, type: SIGNED_ENTRY_TYPE, ts, body, device, cert, sig }
}

export function isSignedEntry(entry) {
  return entry?.type === SIGNED_ENTRY_TYPE && entry?.v === 2
}

/**
 * The message shape of a signed `message` entry for this channel, or null
 * when it is not shown (unsigned, forged, another channel or kind). Whether
 * it is shown depends only on rules both cores share (readableBodyError).
 */
export function readSignedMessageEntry(entry, channelId) {
  if (!isSignedEntry(entry)) return null
  if (!Number.isSafeInteger(entry.ts) || entry.ts <= 0) return null
  if (!verifySignedEnvelope(entry, { channelId }).ok) return null
  const { body } = entry
  if (body.kind !== 'message' || readableBodyError(body)) return null
  const message = {
    type: 'message',
    author: body.author,
    content: body.content,
    timestamp: entry.ts,
    clientMessageId: body.id,
    createdAt: body.createdAt,
  }
  for (const [field, check] of Object.entries(OPTIONAL_FIELD_CHECKS)) {
    if (has(body, field) && check(body)) message[field] = body[field]
  }
  return message
}
