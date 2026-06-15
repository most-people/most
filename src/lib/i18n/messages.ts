import { enCoreMessages, zhCNCoreMessages } from './messages/core'
import { enDownloadMessages, zhCNDownloadMessages } from './messages/download'
import { enPingMessages, zhCNPingMessages } from './messages/ping'
import { enPortalMessages, zhCNPortalMessages } from './messages/portal'
import { enConnectionMessages, zhCNConnectionMessages } from './messages/connection'
import { enChatMessages, zhCNChatMessages } from './messages/chat'
import { enChatJoinMessages, zhCNChatJoinMessages } from './messages/chatJoin'
import { enFilesMessages, zhCNFilesMessages } from './messages/files'
import { enNoteMessages, zhCNNoteMessages } from './messages/note'
import { enIdentityMessages, zhCNIdentityMessages } from './messages/identity'
import { enWeb3Messages, zhCNWeb3Messages } from './messages/web3'
import { enGameMessages, zhCNGameMessages } from './messages/game'
import { enAdminMessages, zhCNAdminMessages } from './messages/admin'
import { enProfileMessages, zhCNProfileMessages } from './messages/profile'

export const DEFAULT_LOCALE = 'zh-CN'
export const LOCALE_STORAGE_KEY = 'mostbox.locale'

export const LOCALES = ['zh-CN', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const localeNames: Record<Locale, string> = {
  'zh-CN': '中文',
  en: 'English',
}

export const zhCNMessages = {
  ...zhCNCoreMessages,
  ...zhCNDownloadMessages,
  ...zhCNPingMessages,
  ...zhCNPortalMessages,
  ...zhCNConnectionMessages,
  ...zhCNChatMessages,
  ...zhCNChatJoinMessages,
  ...zhCNFilesMessages,
  ...zhCNNoteMessages,
  ...zhCNIdentityMessages,
  ...zhCNWeb3Messages,
  ...zhCNGameMessages,
  ...zhCNAdminMessages,
  ...zhCNProfileMessages,
} as const

export type MessageKey = keyof typeof zhCNMessages

export const enMessages = {
  ...enCoreMessages,
  ...enDownloadMessages,
  ...enPingMessages,
  ...enPortalMessages,
  ...enConnectionMessages,
  ...enChatMessages,
  ...enChatJoinMessages,
  ...enFilesMessages,
  ...enNoteMessages,
  ...enIdentityMessages,
  ...enWeb3Messages,
  ...enGameMessages,
  ...enAdminMessages,
  ...enProfileMessages,
} satisfies Record<MessageKey, string>

export const messages = {
  'zh-CN': zhCNMessages,
  en: enMessages,
} satisfies Record<Locale, Record<MessageKey, string>>
