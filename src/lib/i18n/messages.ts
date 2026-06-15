import {
  enCoreMessages,
  zhCNCoreMessages,
  zhTWCoreMessages,
} from './messages/core'
import {
  enDownloadMessages,
  zhCNDownloadMessages,
  zhTWDownloadMessages,
} from './messages/download'
import {
  enPingMessages,
  zhCNPingMessages,
  zhTWPingMessages,
} from './messages/ping'
import {
  enPortalMessages,
  zhCNPortalMessages,
  zhTWPortalMessages,
} from './messages/portal'
import {
  enConnectionMessages,
  zhCNConnectionMessages,
  zhTWConnectionMessages,
} from './messages/connection'
import {
  enChatMessages,
  zhCNChatMessages,
  zhTWChatMessages,
} from './messages/chat'
import {
  enChatJoinMessages,
  zhCNChatJoinMessages,
  zhTWChatJoinMessages,
} from './messages/chatJoin'
import {
  enFilesMessages,
  zhCNFilesMessages,
  zhTWFilesMessages,
} from './messages/files'
import {
  enNoteMessages,
  zhCNNoteMessages,
  zhTWNoteMessages,
} from './messages/note'
import {
  enIdentityMessages,
  zhCNIdentityMessages,
  zhTWIdentityMessages,
} from './messages/identity'
import {
  enWeb3Messages,
  zhCNWeb3Messages,
  zhTWWeb3Messages,
} from './messages/web3'
import {
  enGameMessages,
  zhCNGameMessages,
  zhTWGameMessages,
} from './messages/game'
import {
  enAdminMessages,
  zhCNAdminMessages,
  zhTWAdminMessages,
} from './messages/admin'
import {
  enProfileMessages,
  zhCNProfileMessages,
  zhTWProfileMessages,
} from './messages/profile'

export const DEFAULT_LOCALE = 'zh-CN'
export const LOCALE_STORAGE_KEY = 'mostbox.locale'

export const LOCALES = ['zh-CN', 'zh-TW', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
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

export const zhTWMessages = {
  ...zhTWCoreMessages,
  ...zhTWDownloadMessages,
  ...zhTWPingMessages,
  ...zhTWPortalMessages,
  ...zhTWConnectionMessages,
  ...zhTWChatMessages,
  ...zhTWChatJoinMessages,
  ...zhTWFilesMessages,
  ...zhTWNoteMessages,
  ...zhTWIdentityMessages,
  ...zhTWWeb3Messages,
  ...zhTWGameMessages,
  ...zhTWAdminMessages,
  ...zhTWProfileMessages,
} satisfies Record<MessageKey, string>

export const messages = {
  'zh-CN': zhCNMessages,
  'zh-TW': zhTWMessages,
  en: enMessages,
} satisfies Record<Locale, Record<MessageKey, string>>
