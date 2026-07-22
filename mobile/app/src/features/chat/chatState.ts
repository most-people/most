import type {
  MobileChannel,
  MobileChannelAttachment,
  MobileChannelMessage,
} from '../../mobileCore/types'
import { parseMostLink } from '../../mobileCore/protocol'

export type ChannelLastReadMap = Record<string, number>

export const CHANNEL_NAME_MIN_LENGTH = 3
export const CHANNEL_NAME_MAX_LENGTH = 30
export const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

const MOST_LINK_PREFIX = 'most://'
const MOST_LINK_REGEX = /most:\/\/[^\s]+/u
const FILENAME_QUERY_PREFIX = '?filename='
const CID_ONLY_LINK_TERMINATORS = new Set([
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  ')',
  ']',
  '}',
  '，',
  '。',
  '！',
  '？',
  '；',
  '：',
  '）',
  '】',
  '》',
])
const QUERY_LINK_TERMINATORS = new Set([
  ',',
  ';',
  ':',
  '?',
  ']',
  '}',
  '，',
  '。',
  '！',
  '？',
  '；',
  '：',
  '）',
  '】',
  '》',
])
const TRAILING_LINK_PUNCTUATION = new Set([
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  ')',
  ']',
  '}',
  '，',
  '。',
  '！',
  '？',
  '；',
  '：',
  '）',
  '】',
  '》',
])

type ChannelNameValidationResult = {
  valid: boolean
  message: string
  name: string
}

export function getChannelKey(channel?: MobileChannel | null) {
  return channel?.channelKey || channel?.name || ''
}

export function getChannelId(channel?: MobileChannel | null) {
  return channel?.channelId || channel?.name || ''
}

export function getChannelTitle(channel?: MobileChannel | null) {
  const remark = channel?.remark.trim() || ''
  return remark || getChannelId(channel)
}

export function validateChannelName(
  value: string
): ChannelNameValidationResult {
  const name = value.trim()

  if (name.length < CHANNEL_NAME_MIN_LENGTH) {
    return {
      valid: false,
      message: '频道 ID 至少 3 个字符',
      name,
    }
  }

  if (name.length > CHANNEL_NAME_MAX_LENGTH) {
    return {
      valid: false,
      message: '频道 ID 最多 30 个字符',
      name,
    }
  }

  if (name.includes('.')) {
    return {
      valid: false,
      message: '点号为系统保留，不能用于手动频道 ID',
      name,
    }
  }

  if (!CHANNEL_NAME_REGEX.test(name)) {
    return {
      valid: false,
      message: '频道 ID 只能包含字母、数字、下划线和连字符',
      name,
    }
  }

  return {
    valid: true,
    message: '',
    name,
  }
}

export function parseChannelJoinInput(value: string) {
  const input = value.trim()
  if (!input) return ''
  if (input.startsWith('#')) return decodeChannelHash(input)

  if (input.includes('://') || input.startsWith('/')) {
    try {
      const url = new URL(input, 'https://localhost')
      if (url.pathname.replace(/\/+$/, '') !== '/chat') return ''
      return decodeChannelHash(url.hash)
    } catch {
      return ''
    }
  }

  return input
}

function decodeChannelHash(hash: string) {
  const encodedId = hash.replace(/^#/, '')
  if (!encodedId) return ''

  try {
    return decodeURIComponent(encodedId).trim()
  } catch {
    return ''
  }
}

export function getChannelActivityTime(channel: MobileChannel) {
  return (
    parseTimestamp(channel.lastMessageAt) ??
    parseTimestamp(channel.createdAt) ??
    0
  )
}

export function sortChannelsForChatList(channels: MobileChannel[]) {
  return channels
    .map((channel, index) => ({
      activityTime: getChannelActivityTime(channel),
      channel,
      index,
    }))
    .sort((left, right) => {
      const pinnedDiff =
        Number(right.channel.pinned) - Number(left.channel.pinned)
      if (pinnedDiff !== 0) return pinnedDiff

      const activityDiff = right.activityTime - left.activityTime
      if (activityDiff !== 0) return activityDiff

      return left.index - right.index
    })
    .map(item => item.channel)
}

export function filterChannelsForQuery(
  channels: MobileChannel[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return channels

  return channels.filter(channel => {
    const searchableValues = [
      channel.remark,
      channel.channelId,
      channel.channelKey,
      channel.name,
    ]

    return searchableValues.some(value =>
      value.toLowerCase().includes(normalizedQuery)
    )
  })
}

export function hasUnreadChannel(
  channel: MobileChannel,
  lastReadAt: ChannelLastReadMap
) {
  const activityTime = getChannelActivityTime(channel)
  if (activityTime <= 0) return false

  const channelKey = getChannelKey(channel)
  return activityTime > (lastReadAt[channelKey] ?? 0)
}

export function markChannelRead(
  lastReadAt: ChannelLastReadMap,
  channelKey: string,
  timestamp = Date.now()
) {
  if (!channelKey) return lastReadAt

  return {
    ...lastReadAt,
    [channelKey]: Math.max(lastReadAt[channelKey] ?? 0, timestamp),
  }
}

export function sortMessagesForDisplay(messages: MobileChannelMessage[]) {
  return messages
    .map((message, index) => ({ index, message }))
    .sort((left, right) => {
      const timestampDiff = left.message.timestamp - right.message.timestamp
      if (timestampDiff !== 0) return timestampDiff
      return left.index - right.index
    })
    .map(item => item.message)
}

export function createMessageKey(message: MobileChannelMessage) {
  return [
    message.author,
    Number(message.timestamp),
    message.content,
    message.attachment?.link ?? '',
  ].join(':')
}

export function getAttachmentFromMessage(
  message: MobileChannelMessage
): MobileChannelAttachment | null {
  if (message.attachment) return message.attachment

  const link = getFallbackMostLink(message.content)
  if (!link) return null

  try {
    const { cid, fileName } = parseMostLink(link)
    return {
      kind: 'file',
      cid,
      fileName,
      link,
    }
  } catch {
    return null
  }
}

export function getMessageSummary(message?: MobileChannelMessage) {
  if (!message) return ''

  const authorName = message.authorName || '未知'
  const attachment = getAttachmentFromMessage(message)
  if (attachment) return `${authorName}: ${attachment.fileName}`

  return `${authorName}: ${message.content.trim()}`
}

function getFallbackMostLink(content: string) {
  const candidate = content.match(MOST_LINK_REGEX)?.[0]
  if (!candidate) return null

  const filenameQueryValueStart = getFilenameQueryValueStart(candidate)
  if (filenameQueryValueStart !== -1) {
    return trimAtLinkTerminator(
      candidate,
      QUERY_LINK_TERMINATORS,
      filenameQueryValueStart
    )
  }

  return trimTrailingLinkPunctuation(
    trimAtLinkTerminator(
      candidate,
      CID_ONLY_LINK_TERMINATORS,
      MOST_LINK_PREFIX.length
    )
  )
}

function getFilenameQueryValueStart(candidate: string) {
  const queryIndex = candidate.indexOf(
    FILENAME_QUERY_PREFIX,
    MOST_LINK_PREFIX.length
  )
  if (queryIndex === -1) return -1
  return queryIndex + FILENAME_QUERY_PREFIX.length
}

function trimAtLinkTerminator(
  candidate: string,
  terminators: Set<string>,
  startIndex: number
) {
  for (let index = startIndex; index < candidate.length; index += 1) {
    const char = candidate[index]
    if (!terminators.has(char)) continue

    const link = candidate.slice(0, index)
    if (isParsableMostLink(link)) return link
  }

  return candidate
}

function trimTrailingLinkPunctuation(candidate: string) {
  let link = candidate

  while (link.length > MOST_LINK_PREFIX.length) {
    const lastChar = link[link.length - 1]
    if (!TRAILING_LINK_PUNCTUATION.has(lastChar)) break

    const trimmedLink = link.slice(0, -1)
    if (!isParsableMostLink(trimmedLink)) break

    link = trimmedLink
  }

  return link
}

function isParsableMostLink(link: string) {
  try {
    parseMostLink(link)
    return true
  } catch {
    return false
  }
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return timestamp
}
