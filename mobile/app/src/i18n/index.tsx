import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  localeNames,
  type Locale,
} from './locales'
import { messages, type MessageKey } from './messages'
import {
  interpolateMessage,
  translateMessage,
  type TranslationParams,
} from './translate'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: TranslationParams) => string
  formatDateTime: (value: Date | string | number) => string
  formatNumber: (value: number) => string
  compareStrings: (left: string, right: string) => number
}

const I18nContext = createContext<I18nContextValue | null>(null)
const localePreferencePath = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}mostbox-locale.txt`
  : ''

export {
  DEFAULT_LOCALE,
  LOCALES,
  localeNames,
  messages,
  type Locale,
  type MessageKey,
}
export { interpolateMessage, translateMessage, type TranslationParams }

async function readStoredLocale() {
  if (!localePreferencePath) return DEFAULT_LOCALE
  try {
    const value = await FileSystem.readAsStringAsync(localePreferencePath, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    const normalized = value.trim()
    return isLocale(normalized) ? normalized : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

async function persistLocale(locale: Locale) {
  if (!localePreferencePath) return
  try {
    await FileSystem.writeAsStringAsync(localePreferencePath, locale, {
      encoding: FileSystem.EncodingType.UTF8,
    })
  } catch {
    // Keep the in-memory locale when preference storage is unavailable.
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    let active = true
    void readStoredLocale().then(storedLocale => {
      if (active) setLocaleState(storedLocale)
    })
    return () => {
      active = false
    }
  }, [])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    void persistLocale(nextLocale)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const numberFormatter = new Intl.NumberFormat(locale)
    const collator = new Intl.Collator(locale)

    return {
      locale,
      setLocale,
      t: (key, params) => translateMessage(key, locale, params),
      formatDateTime: value => {
        const date = value instanceof Date ? value : new Date(value)
        return Number.isNaN(date.getTime())
          ? ''
          : dateTimeFormatter.format(date)
      },
      formatNumber: value => numberFormatter.format(value),
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
