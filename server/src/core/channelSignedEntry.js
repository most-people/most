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
import {
  CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
  normalizeChannelMentionList,
} from './channelMessage.js'
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

// Profile fields (§4.2): absent leaves a field unchanged; `tag: null` clears
// the tag. Same rule as messages: written only in normal form, and a field not
// in normal form is not applied on read.
const PROFILE_FIELD_CHECKS = {
  displayName: body =>
    typeof body.displayName === 'string' &&
    normalizeChannelDisplayName(body.displayName, body.author) ===
      body.displayName,
  avatar: body => normalizeChannelAvatar(body.avatar) === body.avatar,
  tag: body =>
    body.tag === null ||
    sameJson(normalizeLocalizedChatTag(body.tag), body.tag),
}

/** Checks a signed `profile` envelope a client sends; '' when acceptable. */
export function signedProfileError(envelope, { channelId } = {}) {
  const verified = verifySignedEnvelope(envelope, { channelId })
  if (!verified.ok) return verified.error
  const { body } = envelope
  if (body.kind !== 'profile') return 'expected a profile body'
  for (const [field, check] of Object.entries(PROFILE_FIELD_CHECKS)) {
    if (has(body, field) && !check(body)) return `invalid ${field}`
  }
  return ''
}

/**
 * A signed `profile` entry as the member profile event the engine applies
 * (newest createdAt wins), or null when it is not one.
 */
export function readSignedProfileEntry(entry, channelId) {
  if (!isSignedEntry(entry)) return null
  if (!Number.isSafeInteger(entry.ts) || entry.ts <= 0) return null
  if (!verifySignedEnvelope(entry, { channelId }).ok) return null
  const { body } = entry
  if (body.kind !== 'profile' || readableBodyError(body)) return null
  const member = { address: body.author, profileUpdatedAt: body.createdAt }
  for (const [field, check] of Object.entries(PROFILE_FIELD_CHECKS)) {
    if (has(body, field) && check(body)) member[field] = body[field]
  }
  return {
    type: 'system',
    event: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
    content: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
    author: body.author,
    member,
    timestamp: entry.ts,
  }
}

/** What a writer core block shows: a message, a profile event, or null. */
export function readSignedEntry(entry, channelId) {
  return (
    readSignedMessageEntry(entry, channelId) ||
    readSignedProfileEntry(entry, channelId)
  )
}
