import { Check, Languages } from 'lucide-react'
import { ActionMenu } from '~/components/ui'
import { LOCALES, localeNames, useI18n } from '~/lib/i18n'

interface LanguageToggleProps {
  className?: string
}

export function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { locale, localeName, setLocale, t } = useI18n()
  const label = t('common.locale.choose')
  const title = `${label} (${t('common.locale.current')}: ${localeName})`

  return (
    <ActionMenu
      ariaLabel={label}
      placement="bottom-end"
      items={LOCALES.map(item => ({
        key: item,
        label: localeNames[item],
        icon:
          item === locale ? (
            <Check size={16} />
          ) : (
            <span aria-hidden="true" />
          ),
        onSelect: () => {
          if (item !== locale) setLocale(item)
        },
      }))}
      renderTrigger={triggerProps => (
        <button
          {...triggerProps}
          className={['language-toggle', className].filter(Boolean).join(' ')}
          aria-label={label}
          title={title}
        >
          <Languages size={16} />
        </button>
      )}
    />
  )
}
