import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

export function MarketingThemeToggle() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches
    if (saved === 'dark' || (!saved && prefersDark)) {
      setIsDarkMode(true)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      isDarkMode ? 'dark' : 'light'
    )
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  return (
    <button
      type="button"
      className="mkt-theme-toggle"
      onClick={() => setIsDarkMode(!isDarkMode)}
      aria-label={t('common.theme.toggle')}
      title={t('common.theme.toggle')}
    >
      {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
