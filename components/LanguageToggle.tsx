import { Languages } from 'lucide-react'
import { getNextLocale, useI18n } from '~/lib/i18n'

interface LanguageToggleProps {
  className?: string
}

export function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { locale, setLocale } = useI18n()
  const nextLocale = getNextLocale(locale)
  const label = locale === 'zh-CN' ? '切换到英文' : '切换到中文'

  return (
    <button
      type="button"
      className={['language-toggle', className].filter(Boolean).join(' ')}
      onClick={() => setLocale(nextLocale)}
      aria-label={label}
      title={label}
    >
      <Languages size={16} />
    </button>
  )
}
