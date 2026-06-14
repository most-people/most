import { useState } from 'react'
import { LogOut, MoreHorizontal } from 'lucide-react'
import { ActionMenu, ConfirmModal } from '~/components/ui'
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
        <img
          className="user-avatar-img"
          src={generateAvatar(identity?.address, identity?.avatar)}
          alt="avatar"
        />
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
        <ActionMenu
          ariaLabel={t('account.actions')}
          placement="top-end"
          items={[
            {
              key: 'logout',
              label: t('account.logout'),
              icon: <LogOut size={16} />,
              onSelect: () => setShowLogoutConfirm(true),
            },
          ]}
          renderTrigger={triggerProps => (
            <button
              {...triggerProps}
              className="btn btn-icon account-menu-trigger"
              aria-label={t('common.moreActions')}
              title={t('common.moreActions')}
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        />
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
