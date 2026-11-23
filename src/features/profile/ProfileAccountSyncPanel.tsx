import { useI18n } from '~/lib/i18n'
import { useAccountSync } from '~/features/profile/useAccountSync'
import { useAppStore } from '~/stores/useAppStore'

export function ProfileAccountSyncPanel() {
  const { t } = useI18n()
  const sync = useAccountSync()
  const hasBackend = useAppStore(s => s.hasBackend)

  const active = sync.available && (sync.local || sync.allowed)
  const devices = sync.status?.writerCores ?? 0

  return (
    <div className="profile-row">
      <div className="profile-row-text">
        <h3>{t('profile.section.sync')}</h3>
        <p>{t('profile.section.sync.desc')}</p>
        {!sync.available ? (
          hasBackend === false && (
            <p className="profile-row-note">{t('profile.sync.needsNode')}</p>
          )
        ) : (
          <p className="profile-row-note">
            {sync.local
              ? t('profile.sync.local')
              : active
                ? t('profile.sync.remoteOn')
                : t('profile.sync.remoteWarning')}
          </p>
        )}
        {active && sync.status?.registered && (
          <p className="profile-row-note">
            {t('profile.sync.devices', { count: devices })}
          </p>
        )}
        {sync.failed && (
          <p className="profile-row-note is-error">{t('profile.sync.error')}</p>
        )}
      </div>
      {!(sync.available && sync.local) && (
        <div className="profile-row-control">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!sync.available || sync.busy}
            onClick={() => void sync.toggle()}
          >
            {sync.available && sync.allowed
              ? t('profile.sync.disable')
              : t('profile.sync.enable')}
          </button>
        </div>
      )}
    </div>
  )
}
