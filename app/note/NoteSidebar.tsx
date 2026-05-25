'use client'

import type { ReactNode } from 'react'
import SidebarAccount from '~/components/SidebarAccount'

interface NoteSidebarProps {
  children?: ReactNode
}

export function NoteSidebar({ children }: NoteSidebarProps) {
  return (
    <>
      <div
        className="sidebar-header sidebar-header-link"
        onClick={() => {
          window.location.href = '/'
        }}
      >
        <h1>MOST PEOPLE</h1>
      </div>
      {children}
      <SidebarAccount />
    </>
  )
}
