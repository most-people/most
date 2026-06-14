import { Languages } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

interface LanguageToggleProps {
  className?: string
}

export function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { locale, nextLocale, setLocale, t } = useI18n()
  const label =
    locale === 'zh-CN'
      ? t('common.locale.switchToEnglish')
      : t('common.locale.switchToChinese')

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
