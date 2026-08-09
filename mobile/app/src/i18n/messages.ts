import { LOCALES, type Locale } from './locales'
import { appMessages } from './messages/app'
import { chatMessages } from './messages/chat'
import { coreMessages } from './messages/core'
import { knowledgeMessages } from './messages/knowledge'
import { nodeMessages } from './messages/node'
import { p2pPingMessages } from './messages/p2pPing'

export const messageDefinitions = {
  ...coreMessages,
  ...appMessages,
  ...nodeMessages,
  ...p2pPingMessages,
  ...knowledgeMessages,
  ...chatMessages,
} as const

export type MessageKey = keyof typeof messageDefinitions

function buildLocaleMessages(locale: Locale) {
  const localeMessages = {} as Record<MessageKey, string>
  for (const key of Object.keys(messageDefinitions) as MessageKey[]) {
    localeMessages[key] = messageDefinitions[key][locale]
  }
  return localeMessages
}

export const messages = Object.fromEntries(
  LOCALES.map(locale => [locale, buildLocaleMessages(locale)])
) as Record<Locale, Record<MessageKey, string>>
