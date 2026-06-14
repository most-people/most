import React from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, X } from 'lucide-react'
import { useUserStore } from '~/stores/userStore'
import { useAppStore } from '~/stores/useAppStore'
import { ModalOverlay } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import { generateAvatar } from '~server/src/utils/avatar.js'

export default function UserLoginModal() {
  const { t } = useI18n()
  const addToast = useAppStore(s => s.addToast)
  const showLoginModal = useUserStore(s => s.showLoginModal)
  const closeLoginModal = useUserStore(s => s.closeLoginModal)
  const loginUsername = useUserStore(s => s.loginUsername)
  const loginPassword = useUserStore(s => s.loginPassword)
  const showPassword = useUserStore(s => s.showPassword)
  const loginPreviewAddress = useUserStore(s => s.loginPreviewAddress)
  const hasPreviewedAvatar = useUserStore(s => s.hasPreviewedAvatar)
  const loginLoading = useUserStore(s => s.loginLoading)
  const loginError = useUserStore(s => s.loginError)
  const setLoginUsername = useUserStore(s => s.setLoginUsername)
  const setLoginPassword = useUserStore(s => s.setLoginPassword)
  const togglePassword = useUserStore(s => s.togglePassword)
  const previewLoginIdentity = useUserStore(s => s.previewLoginIdentity)
  const loginUser = useUserStore(s => s.loginUser)

  if (!showLoginModal) return null

  const previewLabel = loginPreviewAddress
    ? `${loginPreviewAddress.slice(0, 6)}...${loginPreviewAddress.slice(-4)}`
    : 'Most People'

  function handleLogin() {
    const identity = loginUser()
    if (identity) {
      addToast(
        t('login.toast.signedIn', { username: identity.username }),
        'success'
      )
    }
  }

  const modal = (
    <ModalOverlay onClose={closeLoginModal}>
      <form
        className="login-modal"
        onSubmit={event => {
          event.preventDefault()
          handleLogin()
        }}
      >
        <div className="login-modal-header">
          <h3>{t('login.title')}</h3>
          <button
            className="login-modal-close"
            onClick={closeLoginModal}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="login-modal-body">
          <img
            className="login-avatar-preview"
            src={
              loginPreviewAddress
                ? generateAvatar(loginPreviewAddress)
                : '/avatar.png'
            }
            alt="avatar"
          />
          <p className="login-tip">{previewLabel}</p>
          {loginError && <p className="login-error">{t(loginError)}</p>}
          <input
            type="text"
            className="input input-compact"
            placeholder={t('login.username.placeholder')}
            value={loginUsername}
            onChange={event => setLoginUsername(event.target.value)}
            autoFocus
          />
          <div className="login-password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input input-compact"
              placeholder={t('login.password.placeholder')}
              value={loginPassword}
              onChange={event => setLoginPassword(event.target.value)}
            />
            <button
              className="login-password-toggle"
              type="button"
              onClick={togglePassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="login-buttons-row">
            <button
              className="btn btn-secondary"
              onClick={previewLoginIdentity}
              disabled={hasPreviewedAvatar || loginLoading}
              type="button"
            >
              {hasPreviewedAvatar ? t('login.previewed') : t('login.preview')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!hasPreviewedAvatar || loginLoading}
              type="submit"
            >
              {loginLoading ? t('login.loading') : t('common.confirm')}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  )

  return createPortal(modal, document.body)
}
