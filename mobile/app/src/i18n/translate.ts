import { DEFAULT_LOCALE, type Locale } from './locales'
import { messages, type MessageKey } from './messages'

export type TranslationParams = Record<string, string | number>

export function interpolateMessage(
  template: string,
  params?: TranslationParams
) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] === undefined ? `{${key}}` : String(params[key])
  )
}

export function translateMessage(
  key: MessageKey,
  locale: Locale = DEFAULT_LOCALE,
  params?: TranslationParams
) {
  return interpolateMessage(
    messages[locale][key] || messages[DEFAULT_LOCALE][key],
    params
  )
}
