import { useState } from 'react'
import { LogOut, MoreHorizontal } from 'lucide-react'
import { ActionMenu, ConfirmModal } from '~/components/ui'
import { generateAvatar } from '~/server/src/utils/avatar.js'
import { useUserStore } from '~/app/app/userStore'

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

  return (
    <div className={`chat-sidebar-footer sidebar-account ${className}`}>
      <div className="user-info">
        <img
          className="user-avatar-img"
          src={generateAvatar(identity?.address, identity?.avatar)}
          alt="avatar"
        />
        <span className="user-name" title={identity?.address}>
          {identity?.displayName || '未登录'}
        </span>
      </div>
      {!identity ? (
        <button className="btn btn-primary login-btn" onClick={openLoginModal}>
          登录
        </button>
      ) : (
        <ActionMenu
          ariaLabel="账号操作"
          placement="top-end"
          items={[
            {
              key: 'logout',
              label: '退出',
              icon: <LogOut size={16} />,
              onSelect: () => setShowLogoutConfirm(true),
            },
          ]}
          renderTrigger={triggerProps => (
            <button
              {...triggerProps}
              className="btn btn-icon account-menu-trigger"
              aria-label="更多操作"
              title="更多操作"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        />
      )}
      {showLogoutConfirm && (
        <ConfirmModal
          title="退出登录"
          message="确定要退出当前账号吗？"
          confirmText="退出"
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
