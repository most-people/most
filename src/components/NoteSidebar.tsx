import type { ReactNode } from 'react'
import SidebarAccount from '~/components/SidebarAccount'
import { SidebarHomeLink } from '~/components/SidebarHomeLink'

interface NoteSidebarProps {
  children?: ReactNode
}

export function NoteSidebar({ children }: NoteSidebarProps) {
  return (
    <>
      <SidebarHomeLink />
      {children}
      <SidebarAccount />
    </>
  )
}
