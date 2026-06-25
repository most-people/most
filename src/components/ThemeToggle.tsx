import { Moon, Sun } from 'lucide-react'
import { useI18n } from '~/lib/i18n'
import { useAppStore } from '~/stores/useAppStore'

export function ThemeToggle() {
  const { t } = useI18n()
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const label = t('common.theme.toggle')

  return (
    <button
      type="button"
      className="header-tool-btn"
      title={label}
      aria-label={label}
      aria-pressed={isDarkMode}
      onClick={() => setIsDarkMode(!isDarkMode)}
    >
      {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
