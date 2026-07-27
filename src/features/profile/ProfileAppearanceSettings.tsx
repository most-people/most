import { useI18n, type MessageKey } from '~/lib/i18n'
import type { AppearancePreference } from '~/lib/appearance'
import { useAppStore } from '~/stores/useAppStore'

const APPEARANCE_OPTIONS: Array<{
  value: AppearancePreference
  labelKey: MessageKey
}> = [
  { value: 'system', labelKey: 'common.appearance.system' },
  { value: 'light', labelKey: 'common.appearance.light' },
  { value: 'dark', labelKey: 'common.appearance.dark' },
]

export function ProfileAppearanceSettings() {
  const { t } = useI18n()
  const appearance = useAppStore(state => state.appearance)
  const setAppearance = useAppStore(state => state.setAppearance)

  return (
    <section
      className="profile-appearance-section profile-panel ui-glass-surface"
      aria-labelledby="profile-appearance-title"
    >
      <h2 id="profile-appearance-title" className="profile-appearance-title">
        {t('profile.section.theme')}
      </h2>
      <div
        className="profile-appearance-options"
        role="radiogroup"
        aria-label={t('profile.section.theme')}
      >
        {APPEARANCE_OPTIONS.map(option => {
          const selected = option.value === appearance

          return (
            <button
              key={option.value}
              type="button"
              className={[
                'profile-appearance-option',
                selected ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="radio"
              aria-checked={selected}
              onClick={() => setAppearance(option.value)}
            >
              <span
                className={`profile-theme-preview is-${option.value}`}
                aria-hidden="true"
              >
                <span className="profile-theme-preview-handle" />
                <span className="profile-theme-preview-rule" />
                <span className="profile-theme-preview-window">
                  <span className="profile-theme-preview-row is-short" />
                  <span className="profile-theme-preview-row" />
                  <span className="profile-theme-preview-divider" />
                  <span className="profile-theme-preview-row is-short" />
                  <span className="profile-theme-preview-row" />
                </span>
              </span>
              <span className="profile-appearance-option-label">
                {t(option.labelKey)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
