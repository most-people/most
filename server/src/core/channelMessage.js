import {
  CHAT_VISIBLE_LABEL_MAX_CODE_POINTS,
  normalizeVisibleChatLabel,
} from '../utils/chatLabels.js'
import { ValidationError } from '../utils/errors.js'
import { normalizeOwnerAddress } from './ownerMetadata.js'

export const CHANNEL_MEMBER_JOINED_EVENT = 'channel.member.joined'
export const CHANNEL_MEMBER_PROFILE_UPDATED_EVENT =
  'channel.member.profile.updated'
export const CHANNEL_MEMBER_PROFILE_TIME_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

const CHANNEL_MENTION_LIMIT = 20
const CLIENT_MESSAGE_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeClientMessageId(input, { strict = false } = {}) {
  if (input === undefined || input === null || input === '') {
    if (strict) throw new ValidationError('Invalid clientMessageId')
    return ''
  }
  if (
    typeof input !== 'string' ||
    !CLIENT_MESSAGE_ID_REGEX.test(input.trim())
  ) {
    if (strict) throw new ValidationError('Invalid clientMessageId')
    return ''
  }
  return input.trim().toLowerCase()
}

export function normalizeChannelMentionList(input, content, options = {}) {
  const { strict = false, attachment = null } = options
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    if (strict) throw new ValidationError('mentions must be an array')
    return []
  }
  if (attachment && input.length > 0) {
    if (strict) {
      throw new ValidationError('attachment messages cannot include mentions')
    }
    return []
  }
  if (strict && input.length > CHANNEL_MENTION_LIMIT) {
    throw new ValidationError(`mentions cannot exceed ${CHANNEL_MENTION_LIMIT}`)
  }

  const normalized = []
  let previousEnd = -1
  const sourceContent = String(content || '')
  const candidates = strict ? input : input.slice(0, CHANNEL_MENTION_LIMIT)

  for (const item of candidates) {
    const address = normalizeOwnerAddress(item?.address)
    const label = normalizeVisibleChatLabel(item?.label)
    const start = Number(item?.start)
    const end = Number(item?.end)
    const valid =
      address &&
      label &&
      Array.from(label).length <= CHAT_VISIBLE_LABEL_MAX_CODE_POINTS &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end > start &&
      end <= sourceContent.length &&
      start >= previousEnd &&
      sourceContent.slice(start, end) === `@${label}`

    if (!valid) {
      if (strict) throw new ValidationError('Invalid mention')
      continue
    }

    normalized.push({ address, label, start, end })
    previousEnd = end
  }

  return normalized
}

export function isChannelHistoryEntry(entry) {
  return entry?.type === 'message' || entry?.type === 'system'
}

export function isChannelMemberProfileEventEntry(entry) {
  return (
    entry?.type === 'system' &&
    String(entry?.event || '').trim() ===
      CHANNEL_MEMBER_PROFILE_UPDATED_EVENT &&
    String(entry?.content || '').trim() === CHANNEL_MEMBER_PROFILE_UPDATED_EVENT
  )
}

export function getChannelHistoryDedupeKey(message) {
  const type = String(message?.type || '')
  const event = String(message?.event || '')
  const author = normalizeOwnerAddress(message?.author)
  const content = String(message?.content || '').trim()

  if (isChannelMemberProfileEventEntry(message)) {
    const memberAddress = normalizeOwnerAddress(message?.member?.address)
    const profileUpdatedAt = Number(message?.member?.profileUpdatedAt)
    if (memberAddress && Number.isFinite(profileUpdatedAt)) {
      return `${type}:${event}:${memberAddress}:${Math.floor(profileUpdatedAt)}`
    }
  }

  if (type === 'system' && event === CHANNEL_MEMBER_JOINED_EVENT && author) {
    return `${type}:${event}:${author}:${content}`
  }

  return [
    message?._coreKey || '',
    type,
    event,
    message?.author || '',
    message?.timestamp || '',
    content,
  ].join(':')
}
