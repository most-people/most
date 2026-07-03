import { Check, Globe2 } from 'lucide-react'
import { ActionMenu } from '~/components/ui'
import { LOCALES, localeNames, useI18n, type Locale } from '~/lib/i18n'

export type LanguageToggleTheme = 'sparkbit'

interface LanguageToggleProps {
  theme?: LanguageToggleTheme
}

export function getLanguageToggleLocales(
  theme?: LanguageToggleTheme
): Locale[] {
  return theme === 'sparkbit'
    ? LOCALES.filter(item => item !== 'zh-CN')
    : [...LOCALES]
}

export function LanguageToggle({ theme }: LanguageToggleProps) {
  const { locale, setLocale, t } = useI18n()
  const label = t('common.locale.choose')
  const locales = getLanguageToggleLocales(theme)

  return (
    <ActionMenu
      ariaLabel={label}
      className="language-toggle"
      items={locales.map(item => ({
        key: item,
        label: localeNames[item],
        icon:
          item === locale ? (
            <Check size={16} />
          ) : (
            <span className="language-toggle-placeholder" aria-hidden="true" />
          ),
        onSelect: () => {
          if (item !== locale) setLocale(item)
        },
      }))}
      renderTrigger={triggerProps => (
        <button
          {...triggerProps}
          className="btn btn-icon"
          title={label}
          aria-label={label}
        >
          <Globe2 size={16} />
        </button>
      )}
    />
  )
}
