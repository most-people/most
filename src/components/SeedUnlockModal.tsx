import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, X } from 'lucide-react'
import { useUserStore } from '~/stores/userStore'
import { ModalOverlay } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

function SeedUnlockForm() {
  const { t } = useI18n()
  const unlockError = useUserStore(s => s.unlockError)
  const submitUnlock = useUserStore(s => s.submitUnlock)
  const cancelUnlock = useUserStore(s => s.cancelUnlock)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  return (
    <ModalOverlay onClose={cancelUnlock} className="login-modal-overlay">
      <form
        className="login-modal"
        onSubmit={event => {
          event.preventDefault()
          submitUnlock(password)
        }}
      >
        <div className="modal-header login-modal-header">
          <h3>{t('unlock.title')}</h3>
          <button
            className="btn btn-icon login-modal-close"
            onClick={cancelUnlock}
            type="button"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="login-modal-body">
          <p className="login-tip">{t('unlock.tip')}</p>
          {unlockError && <p className="login-error">{t(unlockError)}</p>}
          <div className="login-password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input input-compact"
              placeholder={t('unlock.password.placeholder')}
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoFocus
            />
            <button
              className="login-password-toggle"
              type="button"
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="login-buttons-row">
            <button className="btn btn-primary" type="submit">
              {t('unlock.submit')}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  )
}

export default function SeedUnlockModal() {
  const unlockOpen = useUserStore(s => s.unlockOpen)
  if (!unlockOpen) return null
  return createPortal(<SeedUnlockForm />, document.body)
}
