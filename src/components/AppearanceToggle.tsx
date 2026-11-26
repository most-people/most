import { useMediaQuery } from '@mantine/hooks'
import { Moon, Sun } from 'lucide-react'
import { resolveAppearancePreference } from '~/lib/appearance'
import { useI18n } from '~/lib/i18n'
import { useAppStore } from '~/stores/useAppStore'

export function AppearanceToggle() {
  const { t } = useI18n()
  const appearance = useAppStore(s => s.appearance)
  const setAppearance = useAppStore(s => s.setAppearance)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const isDarkMode =
    resolveAppearancePreference(appearance, prefersDark) === 'dark'
  const label = t('common.appearance.toggle')

  return (
    <button
      type="button"
      className="btn btn-icon"
      title={label}
      aria-label={label}
      aria-pressed={isDarkMode}
      onClick={() => setAppearance(isDarkMode ? 'light' : 'dark')}
    >
      {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
