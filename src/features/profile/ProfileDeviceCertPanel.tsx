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
    <div className="profile-row">
      <div className="profile-row-text">
        <h3>{t('profile.certTtl.label')}</h3>
        <p>{t('profile.certTtl.hint')}</p>
        {certWindow && (
          <p className="profile-row-note">
            {t('profile.certTtl.expires', {
              time: formatDateTime(certWindow.expiresAt),
            })}
          </p>
        )}
        {failed && (
          <p className="profile-row-note is-error">
            {t('profile.certTtl.failed')}
          </p>
        )}
      </div>
      <div
        className="profile-segmented"
        role="radiogroup"
        aria-label={t('profile.certTtl.label')}
      >
        {DEVICE_CERT_TTL_CHOICES.map(ttl => (
          <button
            key={ttl}
            type="button"
            role="radio"
            className="profile-segmented-option"
            aria-checked={ttl === current}
            disabled={busy}
            onClick={() => {
              if (ttl !== current) void handleChange(ttl)
            }}
          >
            {t(`profile.certTtl.${ttl}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
