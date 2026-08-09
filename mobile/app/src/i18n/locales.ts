export const DEFAULT_LOCALE = 'zh-CN'
export const LOCALES = ['zh-CN', 'zh-TW', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value as Locale)
}
