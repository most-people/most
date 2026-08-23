import { isLocale, type Locale } from '~/lib/i18n'
import { normalizeLocalizedTag, type LocalizedTag } from '~/lib/localizedTag'

export interface ChatJoinInviteChannel {
  id: string
  name?: string
}

export interface ChatJoinInvitePayload {
  expires_at: number
  node_url?: string
  node_invite?: string
  locale?: Locale
  uid: string
  theme?: 'st'
  appearance?: 'dark' | 'light'
  logo?: string
  logo_dark?: string
  data?: string
  avatar?: string
  tag?: LocalizedTag
  name?: string
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
  return theme === 'st' ? 'st' : undefined
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

  const expiresAt = value.expires_at
  const uid = normalizeOptionalString(value.uid)
  const rawChannels = Array.isArray(value.channels) ? value.channels : []
  const channels = rawChannels
    .filter(isRecord)
    .map(channel => ({
      id: normalizeOptionalString(channel.id),
      name: normalizeOptionalString(channel.name) || undefined,
    }))
    .filter(channel => channel.id)

  if (
    typeof expiresAt !== 'number' ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    !uid ||
    channels.length === 0
  ) {
    return null
  }

  return {
    expires_at: expiresAt,
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
    tag: normalizeLocalizedTag(value.tag),
    name: normalizeOptionalString(value.name) || undefined,
    channels,
  }
}

export function isChatJoinInviteExpired(
  invite: Pick<ChatJoinInvitePayload, 'expires_at'>,
  now = Date.now()
) {
  return invite.expires_at <= now
}
