import { isLocale, type Locale } from '~/lib/i18n'
import { normalizeVisibleChatLabel } from '~server/src/utils/chatLabels.js'

export const CHAT_JOIN_EA_PUBLIC_KEY =
  '0x955fe80bdb8312165471fcacd6a8f83df88a770dda6f38657ca4e62ec28d5b54'
export const CHAT_JOIN_DEFAULT_API_BASE = 'https://api.most.box'

export interface ChatJoinInviteChannel {
  id: string
  name?: string
}

export interface ChatJoinInvitePayload {
  node_url?: string
  node_invite?: string
  locale?: Locale
  uid: string
  theme?: 'sparkbit'
  appearance?: 'dark' | 'light'
  logo?: string
  logo_dark?: string
  data?: string
  avatar?: string
  name?: string
  identity?: string
  channels: ChatJoinInviteChannel[]
}

export function normalizeChatJoinInviteLocale(value: unknown) {
  const locale = typeof value === 'string' ? value.trim() : value
  return isLocale(locale) ? locale : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonText(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function parseNestedJsonText(value: unknown): unknown | null {
  if (typeof value !== 'string') return value
  return parseJsonText(value)
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeInviteTheme(value: unknown): ChatJoinInvitePayload['theme'] {
  const theme = normalizeOptionalString(value)
  return theme === 'sparkbit' ? 'sparkbit' : undefined
}

function normalizeInviteAppearance(
  value: unknown
): ChatJoinInvitePayload['appearance'] {
  const appearance = normalizeOptionalString(value)
  return appearance === 'dark' || appearance === 'light'
    ? appearance
    : undefined
}

export function normalizeChatJoinInvitePayload(
  input: unknown
): ChatJoinInvitePayload | null {
  const value = parseNestedJsonText(input)
  if (!isRecord(value)) return null

  const uid = normalizeOptionalString(value.uid)
  const rawChannels = Array.isArray(value.channels) ? value.channels : []
  const channels = rawChannels
    .filter(isRecord)
    .map(channel => ({
      id: normalizeOptionalString(channel.id),
      name: normalizeOptionalString(channel.name) || undefined,
    }))
    .filter(channel => channel.id)

  if (!uid || channels.length === 0) return null

  return {
    node_url: normalizeOptionalString(value.node_url) || undefined,
    node_invite: normalizeOptionalString(value.node_invite) || undefined,
    locale: normalizeChatJoinInviteLocale(value.locale),
    uid,
    theme: normalizeInviteTheme(value.theme),
    appearance: normalizeInviteAppearance(value.appearance),
    logo: normalizeOptionalString(value.logo) || undefined,
    logo_dark: normalizeOptionalString(value.logo_dark) || undefined,
    data: normalizeOptionalString(value.data) || undefined,
    avatar: normalizeOptionalString(value.avatar) || undefined,
    name: normalizeOptionalString(value.name) || undefined,
    identity: normalizeVisibleChatLabel(value.identity) || undefined,
    channels,
  }
}
