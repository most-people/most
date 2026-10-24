import { useI18n } from '~/lib/i18n'
import { useAccountSync } from '~/features/profile/useAccountSync'

export function ProfileAccountSyncPanel() {
  const { t } = useI18n()
  const sync = useAccountSync()
  if (!sync.available) return null

  const active = sync.local || sync.allowed
  const devices = sync.status?.writerCores ?? 0

  return (
    <section className="profile-panel profile-sync-card ui-glass-surface">
      <div className="profile-panel-header">
        <div>
          <h2>{t('profile.section.sync')}</h2>
          <p>{t('profile.section.sync.desc')}</p>
        </div>
      </div>
      <p className="profile-sync-note">
        {sync.local
          ? t('profile.sync.local')
          : active
            ? t('profile.sync.remoteOn')
            : t('profile.sync.remoteWarning')}
      </p>
      {active && sync.status?.registered && (
        <p className="profile-sync-note">
          {t('profile.sync.devices', { count: devices })}
        </p>
      )}
      {sync.failed && (
        <p className="profile-sync-note profile-sync-error">
          {t('profile.sync.error')}
        </p>
      )}
      {!sync.local && (
        <div className="profile-backup-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={sync.busy}
            onClick={() => void sync.toggle()}
          >
            {sync.allowed
              ? t('profile.sync.disable')
              : t('profile.sync.enable')}
          </button>
        </div>
      )}
    </section>
  )
}
