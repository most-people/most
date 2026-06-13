import { useEffect } from 'react'
import {
  initializeLocale,
  startLocaleDomSync,
  translateDocument,
  useLocale,
} from '~/lib/i18n'

export function LocaleEffects() {
  const locale = useLocale()

  useEffect(() => {
    initializeLocale()
    return startLocaleDomSync()
  }, [])

  useEffect(() => {
    translateDocument(locale)
  }, [locale])

  return null
}
