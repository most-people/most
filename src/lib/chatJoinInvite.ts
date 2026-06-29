import { isLocale, type Locale, type MessageKey } from '~/lib/i18n'

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
  logo?: string
  logo_dark?: string
  data?: string
  avatar?: string
  name?: string
  channels: ChatJoinInviteChannel[]
}

export interface ChatJoinInviteField {
  name: string
  required: boolean
  descriptionKey: MessageKey
}

export const CHAT_JOIN_INVITE_FIELDS: ChatJoinInviteField[] = [
  {
    name: 'node_url',
    required: false,
    descriptionKey: 'chatJoin.field.nodeUrl',
  },
  {
    name: 'node_invite',
    required: false,
    descriptionKey: 'chatJoin.field.nodeInvite',
  },
  {
    name: 'uid',
    required: true,
    descriptionKey: 'chatJoin.field.uid',
  },
  {
    name: 'theme',
    required: false,
    descriptionKey: 'chatJoin.field.theme',
  },
  {
    name: 'logo',
    required: false,
    descriptionKey: 'chatJoin.field.logo',
  },
  {
    name: 'logo_dark',
    required: false,
    descriptionKey: 'chatJoin.field.logoDark',
  },
  {
    name: 'avatar',
    required: false,
    descriptionKey: 'chatJoin.field.avatar',
  },
  {
    name: 'name',
    required: false,
    descriptionKey: 'chatJoin.field.name',
  },
  {
    name: 'locale',
    required: false,
    descriptionKey: 'chatJoin.field.locale',
  },
  {
    name: 'channels[].id',
    required: true,
    descriptionKey: 'chatJoin.field.channelId',
  },
  {
    name: 'channels[].name',
    required: false,
    descriptionKey: 'chatJoin.field.channelName',
  },
]

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
    logo: normalizeOptionalString(value.logo) || undefined,
    logo_dark: normalizeOptionalString(value.logo_dark) || undefined,
    data: normalizeOptionalString(value.data) || undefined,
    avatar: normalizeOptionalString(value.avatar) || undefined,
    name: normalizeOptionalString(value.name) || undefined,
    channels,
  }
}
