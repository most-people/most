import { Moon, Sun } from 'lucide-react'
import { useI18n } from '~/lib/i18n'
import { useAppStore } from '~/stores/useAppStore'

export function AppearanceToggle() {
  const { t } = useI18n()
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const label = t('common.appearance.toggle')

  return (
    <button
      type="button"
      className="btn btn-icon"
      title={label}
      aria-label={label}
      aria-pressed={isDarkMode}
      onClick={() => setIsDarkMode(!isDarkMode)}
    >
      {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
