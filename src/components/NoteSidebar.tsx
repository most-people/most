import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import SidebarAccount from '~/components/SidebarAccount'
import { useBack } from '~/hooks/useBack'

interface NoteSidebarProps {
  children?: ReactNode
}

export function NoteSidebar({ children }: NoteSidebarProps) {
  const back = useBack()

  return (
    <>
      <button
        type="button"
        className="sidebar-header sidebar-header-link"
        onClick={back}
      >
        <ArrowLeft size={18} />
        <h1>MOST PEOPLE</h1>
      </button>
      {children}
      <SidebarAccount />
    </>
  )
}
