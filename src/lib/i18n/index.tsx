import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  localeNames,
  messages,
  type Locale,
  type MessageKey,
} from '~/lib/i18n/messages'

type TranslationParams = Record<string, string | number>

interface I18nContextValue {
  locale: Locale
  localeName: string
  nextLocale: Locale
  nextLocaleName: string
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: TranslationParams) => string
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
  formatTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
  formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  compareStrings: (left: string, right: string) => number
}

const I18nContext = createContext<I18nContextValue | null>(null)

export {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  localeNames,
  messages,
  type Locale,
  type MessageKey,
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value as Locale)
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function getNextLocale(locale: Locale): Locale {
  const currentIndex = LOCALES.indexOf(locale)
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % LOCALES.length
  return LOCALES[nextIndex] ?? DEFAULT_LOCALE
}

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
  return interpolateMessage(messages[locale][key] || messages[DEFAULT_LOCALE][key], params)
}

function readStoredLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return DEFAULT_LOCALE
  }
}

function persistLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Keep the in-memory locale even when storage is blocked.
  }
}

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dataset.locale = locale
}

function toDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value)
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    setLocaleState(readStoredLocale())
  }, [])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    persistLocale(nextLocale)
    applyDocumentLocale(nextLocale)
  }, [])

  useEffect(() => {
    applyDocumentLocale(locale)
  }, [locale])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function handleStorage(event: StorageEvent) {
      if (event.key !== LOCALE_STORAGE_KEY) {
        return
      }
      setLocaleState(readStoredLocale())
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const nextLocale = getNextLocale(locale)
    const dateFormatter = new Intl.DateTimeFormat(locale)
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })
    const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const numberFormatter = new Intl.NumberFormat(locale)
    const collator = new Intl.Collator(locale)

    return {
      locale,
      localeName: localeNames[locale],
      nextLocale,
      nextLocaleName: localeNames[nextLocale],
      setLocale,
      t: (key, params) => translateMessage(key, locale, params),
      formatDate: (value, options) =>
        options
          ? new Intl.DateTimeFormat(locale, options).format(toDate(value))
          : dateFormatter.format(toDate(value)),
      formatTime: (value, options) =>
        options
          ? new Intl.DateTimeFormat(locale, options).format(toDate(value))
          : timeFormatter.format(toDate(value)),
      formatDateTime: (value, options) =>
        options
          ? new Intl.DateTimeFormat(locale, options).format(toDate(value))
          : dateTimeFormatter.format(toDate(value)),
      formatNumber: (value, options) =>
        options
          ? new Intl.NumberFormat(locale, options).format(value)
          : numberFormatter.format(value),
      compareStrings: (left, right) => collator.compare(left, right),
    }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used within I18nProvider')
  return value
}
