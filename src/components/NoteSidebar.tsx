import type { ReactNode } from 'react'
import { AppTop } from '~/components/AppTop'

interface NoteSidebarProps {
  children?: ReactNode
}

export function NoteSidebar({ children }: NoteSidebarProps) {
  return (
    <>
      <AppTop />
      {children}
    </>
  )
}
