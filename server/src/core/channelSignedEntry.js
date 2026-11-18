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

/** Reason a `message` body is not acceptable, or '' (§4.2). */
export function messageBodyError(body) {
  const { content } = body
  if (typeof content !== 'string' || !content || content !== content.trim()) {
    return 'content must be non-empty trimmed text'
  }
  if (content.length > MAX_MESSAGE_LENGTH) return 'content is too long'
  if (has(body, 'authorName')) {
    if (
      typeof body.authorName !== 'string' ||
      normalizeChannelDisplayName(body.authorName, body.author) !==
        body.authorName
    ) {
      return 'invalid authorName'
    }
  }
  if (
    has(body, 'avatar') &&
    normalizeChannelAvatar(body.avatar) !== body.avatar
  ) {
    return 'invalid avatar'
  }
  if (
    has(body, 'authorTag') &&
    !sameJson(normalizeLocalizedChatTag(body.authorTag), body.authorTag)
  ) {
    return 'invalid authorTag'
  }
  let attachment = null
  if (has(body, 'attachment')) {
    try {
      attachment = normalizeChannelAttachment(body.attachment)
    } catch {
      return 'invalid attachment'
    }
    if (!sameJson(attachment, body.attachment)) return 'invalid attachment'
    if (content !== attachment.link) return 'attachment content must match link'
  }
  if (has(body, 'mentions')) {
    let mentions
    try {
      mentions = normalizeChannelMentionList(body.mentions, content, {
        strict: true,
        attachment,
      })
    } catch {
      return 'invalid mentions'
    }
    if (!sameJson(mentions, body.mentions)) return 'invalid mentions'
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
 * The message shape of a valid signed `message` entry for this channel, or
 * null when the entry is not one (unsigned, forged, another channel or kind).
 */
export function readSignedMessageEntry(entry, channelId) {
  if (!isSignedEntry(entry)) return null
  if (!Number.isSafeInteger(entry.ts) || entry.ts <= 0) return null
  if (signedMessageError(entry, { channelId })) return null
  const { body } = entry
  const message = {
    type: 'message',
    author: body.author,
    content: body.content,
    timestamp: entry.ts,
    clientMessageId: body.id,
    createdAt: body.createdAt,
  }
  for (const key of [
    'authorName',
    'avatar',
    'authorTag',
    'attachment',
    'mentions',
  ]) {
    if (has(body, key)) message[key] = body[key]
  }
  return message
}
