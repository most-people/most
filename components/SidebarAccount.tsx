'use client'

import { generateAvatar } from '~/server/src/utils/avatar.js'
import { useUserStore } from '~/app/app/userStore'

interface SidebarAccountProps {
  className?: string
}

export default function SidebarAccount({ className = '' }: SidebarAccountProps) {
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const logoutUser = useUserStore(s => s.logoutUser)

  return (
    <div className={`chat-sidebar-footer sidebar-account ${className}`}>
      <div className="user-info">
        <img
          className="user-avatar-img"
          src={generateAvatar(identity?.address)}
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
        <button className="btn btn-ghost logout-btn" onClick={logoutUser}>
          退出
        </button>
      )}
    </div>
  )
}
