import { Check, Languages } from 'lucide-react'
import { ActionMenu } from '~/components/ui'
import { LOCALES, localeNames, useI18n } from '~/lib/i18n'

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n()
  const label = t('common.locale.choose')

  return (
    <ActionMenu
      ariaLabel={label}
      className="language-toggle"
      items={LOCALES.map(item => ({
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
          <Languages size={16} />
        </button>
      )}
    />
  )
}
