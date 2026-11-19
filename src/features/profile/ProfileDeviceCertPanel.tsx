import { useState } from 'react'
import {
  DEVICE_CERT_TTL_OPTIONS,
  readDeviceCertWindow,
} from '~server/src/utils/auth.js'
import { useI18n } from '~/lib/i18n'
import {
  DEVICE_CERT_TTL_CHOICES,
  useUserStore,
  type DeviceCertTtl,
} from '~/stores/userStore'

/** Device authorization period; changing it may ask for the password again. */
export function ProfileDeviceCertPanel() {
  const { t, formatDateTime } = useI18n()
  const identity = useUserStore(s => s.identity)
  const changeDeviceCertTtl = useUserStore(s => s.changeDeviceCertTtl)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!identity) return null

  const certWindow = readDeviceCertWindow(identity.device.cert)
  const current = DEVICE_CERT_TTL_CHOICES.find(
    ttl => DEVICE_CERT_TTL_OPTIONS[ttl] === certWindow?.ttlMs
  )

  async function handleChange(ttl: DeviceCertTtl) {
    setBusy(true)
    setFailed(false)
    try {
      setFailed(!(await changeDeviceCertTtl(ttl)))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="profile-panel profile-cert-card ui-glass-surface">
      <div className="profile-panel-header">
        <div>
          <h2>{t('profile.certTtl.label')}</h2>
          <p>{t('profile.certTtl.hint')}</p>
        </div>
      </div>
      <div
        className="profile-cert-ttl"
        role="radiogroup"
        aria-label={t('profile.certTtl.label')}
      >
        {DEVICE_CERT_TTL_CHOICES.map(ttl => (
          <label key={ttl} className="profile-cert-ttl-option">
            <input
              type="radio"
              name="device-cert-ttl"
              value={ttl}
              checked={ttl === current}
              disabled={busy}
              onChange={() => void handleChange(ttl)}
            />
            <span>{t(`profile.certTtl.${ttl}`)}</span>
          </label>
        ))}
      </div>
      {certWindow && (
        <p className="profile-sync-note">
          {t('profile.certTtl.expires', {
            time: formatDateTime(certWindow.expiresAt),
          })}
        </p>
      )}
      {failed && (
        <p className="profile-sync-note profile-sync-error">
          {t('profile.certTtl.failed')}
        </p>
      )}
    </section>
  )
}
