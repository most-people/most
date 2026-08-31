import type { Channel, ChannelMention, ChannelMessage } from '~/lib/channelApi'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'
import { shortAddress } from '~/lib/format'
import { messageMentionsAddress } from '~/lib/chatMentions.js'
import type { MemberTag } from '~/lib/localizedTag'
import { getChannelIdFromHash } from '~/lib/chatRoom.js'

export const CHAT_FILE_ROOT = 'chat-file'

export type ChannelMentionUnreadPreview = {
  authorName: string
  content: string
  timestamp: number
}

export type ChannelMentionUnreadPreviewMap = Record<
  string,
  ChannelMentionUnreadPreview
>

export type AttachmentDownloadState = {
  status: 'checking' | 'ready' | 'downloading' | 'available' | 'error'
  message?: string
}

export type ChannelLastReadMap = Record<string, number>
export type ChannelMentionUnreadMap = Record<string, boolean>
export type ComposerSelection = { start: number; end: number }
export type MentionDraft = { content: string; mentions: ChannelMention[] }
export type MentionTarget = { address: string; label: string }
export type DisplayedChannelMemberProfile = {
  address: string
  displayName: string
  avatar?: string
  tag?: MemberTag
  hasPersistedProfile?: boolean
  profileUpdatedAt?: number
  firstSeenAt: number
  lastSeenAt: number
  index: number
}
export type MentionCandidate = {
  address: string
  label: string
  tag?: string
  avatarSrc: string
  online: boolean
}

type BrowserAudioContextConstructor = typeof AudioContext

export function getChannelKey(
  channel?: Pick<Channel, 'channelKey' | 'name'> | null
) {
  return channel?.channelKey || channel?.name || ''
}

export function getChannelId(
  channel?: Pick<Channel, 'channelId' | 'name'> | null
) {
  return channel?.channelId || channel?.name || ''
}

function getObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

export function getSocketEventChannelKeys(data: unknown) {
  const record = getObjectRecord(data)
  const keys = new Set<string>()
  const addKey = (value: unknown) => {
    const key = String(value || '').trim()
    if (key) keys.add(key)
  }

  addKey(record.channelKey)
  addKey(record.channel)
  if (Array.isArray(record.channels)) {
    record.channels.forEach(channel => {
      const channelRecord = getObjectRecord(channel)
      addKey(channelRecord.channelKey)
      addKey(channelRecord.channel)
      addKey(channelRecord.name)
    })
  }

  return [...keys]
}

export function getChannelTitle(
  channel?: Pick<Channel, 'remark' | 'channelId' | 'name'> | null
) {
  return channel?.remark || getChannelId(channel)
}

export function getRequestedChannelNameFromLocation() {
  if (typeof window === 'undefined') return ''
  return getChannelIdFromHash(window.location.hash)
}

export function getAttachmentKind(file: File, fileName: string): FileSubtype {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('text/')) return 'text'
  return getFileSubtype(fileName)
}

export function hasAddressSuffix(name?: string) {
  return /#[a-fA-F0-9]{4}$/.test(String(name || '').trim())
}

export function normalizeMemberAddress(address?: string) {
  return String(address || '')
    .trim()
    .toLowerCase()
}

export function getMentionCandidateBaseName(name?: string, address?: string) {
  const displayName = String(name || '')
    .trim()
    .replace(/#[a-fA-F0-9]{4}$/, '')
  return displayName || shortAddress(address) || 'Unknown'
}

export function formatMentionCandidateLabel({
  name,
  address,
  duplicateName = false,
}: {
  name?: string
  address?: string
  duplicateName?: boolean
}) {
  const baseName = getMentionCandidateBaseName(name, address)
  if (!duplicateName || !address || hasAddressSuffix(baseName)) {
    return baseName
  }
  return `${baseName}#${address.slice(-4).toUpperCase()}`
}

export function formatChannelMentionUnreadPreview(
  message?: ChannelMessage | null
) {
  if (!message) return null
  const content = String(message.content || '').trim()
  if (!content) return null
  const authorName = String(message.authorName || '').trim()
  return {
    authorName: authorName || shortAddress(message.author) || 'Unknown',
    content,
    timestamp: Number(message.timestamp) || Date.now(),
  }
}

export function shouldShowChannelMentionUnread(
  channelKey: string,
  message: ChannelMessage | undefined,
  userAddress?: string
) {
  if (!channelKey || !message) return false
  const isSelfMessage =
    normalizeMemberAddress(message.author) ===
    normalizeMemberAddress(userAddress)
  return !isSelfMessage && messageMentionsAddress(message, userAddress)
}

export function getLatestUnreadMentionMessage(
  messages: ChannelMessage[],
  readAt: number,
  userAddress?: string
) {
  return messages.reduce<ChannelMessage | null>((latest, message) => {
    const timestamp = Number(message?.timestamp)
    if (!Number.isFinite(timestamp) || timestamp <= readAt) return latest
    const isSelfMessage =
      normalizeMemberAddress(message.author) ===
      normalizeMemberAddress(userAddress)
    if (isSelfMessage || !messageMentionsAddress(message, userAddress)) {
      return latest
    }
    if (!latest || timestamp > (Number(latest.timestamp) || 0)) return message
    return latest
  }, null)
}

export function formatChannelMentionPreviewText(
  preview?: ChannelMentionUnreadPreview
) {
  if (!preview) return ''
  return `${preview.authorName}: ${preview.content}`
}

export function stringifyMemberTag(tag: MemberTag | undefined) {
  if (tag === null) return 'null'
  if (!tag) return 'undefined'
  return JSON.stringify(
    Object.keys(tag)
      .sort((a, b) => a.localeCompare(b))
      .map(key => [key, tag[key]])
  )
}

export function getBrowserAudioContextConstructor():
  BrowserAudioContextConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: BrowserAudioContextConstructor
    }
  return audioWindow.AudioContext || audioWindow.webkitAudioContext
}
