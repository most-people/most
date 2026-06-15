import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ConfirmModal } from '~/components/ui'
import { generateAvatar } from '~server/src/utils/avatar.js'
import { useUserStore } from '~/stores/userStore'
import { useI18n } from '~/lib/i18n'

interface SidebarAccountProps {
  className?: string
}

export default function SidebarAccount({
  className = '',
}: SidebarAccountProps) {
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const logoutUser = useUserStore(s => s.logoutUser)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const { t } = useI18n()

  return (
    <div className={`chat-sidebar-footer sidebar-account ${className}`}>
      <div className="user-info">
        {identity ? (
          <Link
            to="/profile/"
            className="user-avatar-link"
            aria-label={t('nav.profile')}
            title={t('nav.profile')}
          >
            <img
              className="user-avatar-img"
              src={generateAvatar(identity.address, identity.avatar)}
              alt=""
              aria-hidden="true"
            />
          </Link>
        ) : (
          <img
            className="user-avatar-img"
            src={generateAvatar(undefined, undefined)}
            alt=""
            aria-hidden="true"
          />
        )}
        <span className="user-name" title={identity?.address}>
          <span translate={identity?.displayName ? 'no' : 'yes'}>
            {identity?.displayName || t('account.notSignedIn')}
          </span>
        </span>
      </div>
      {!identity ? (
        <button className="btn btn-primary login-btn" onClick={openLoginModal}>
          {t('account.signIn')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary logout-btn"
          onClick={() => setShowLogoutConfirm(true)}
        >
          {t('account.logout')}
        </button>
      )}
      {showLogoutConfirm && (
        <ConfirmModal
          title={t('account.logoutTitle')}
          message={t('account.logoutConfirm')}
          confirmText={t('account.logout')}
          danger
          onConfirm={() => {
            logoutUser()
            setShowLogoutConfirm(false)
          }}
          onClose={() => setShowLogoutConfirm(false)}
        />
      )}
    </div>
  )
}
