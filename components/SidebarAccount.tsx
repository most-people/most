'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { ConfirmModal } from '~/components/ui'
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
        <div className="account-actions-menu">
          <button
            className="btn btn-ghost logout-btn"
            type="button"
            aria-label="更多操作"
            title="更多操作"
          >
            <MoreHorizontal size={16} />
          </button>
          <div className="account-actions-dropdown" role="menu">
            <button
              className="account-actions-item danger"
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
            >
              退出
            </button>
          </div>
        </div>
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
