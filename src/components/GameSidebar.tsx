import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ArrowLeft, Spade, Swords } from 'lucide-react'
import SidebarAccount from '~/components/SidebarAccount'
import { useI18n, type MessageKey } from '~/lib/i18n'

type GameSidebarProps = {
  activeGame: 'gandengyan' | 'zhajinhua'
  closeSidebar: () => void
}

const items = [
  {
    id: 'gandengyan',
    labelKey: 'game.gandengyan.title',
    href: '/game/gandengyan/',
    icon: <Swords size={16} />,
  },
  {
    id: 'zhajinhua',
    labelKey: 'game.zhajinhua.title',
    href: '/game/zhajinhua/',
    icon: <Spade size={16} />,
  },
] satisfies Array<{
  id: GameSidebarProps['activeGame']
  labelKey: MessageKey
  href: string
  icon: ReactNode
}>

export default function GameSidebar({
  activeGame,
  closeSidebar,
}: GameSidebarProps) {
  const { t } = useI18n()

  return (
    <>
      <Link to="/" className="sidebar-header sidebar-header-link">
        <ArrowLeft size={18} />
        <h1>MOST PEOPLE</h1>
      </Link>
      <nav className="sidebar-nav">
        {items.map(item => (
          <Link
            key={item.id}
            to={item.href}
            className={`sidebar-nav-btn ${activeGame === item.id ? 'active' : ''}`}
            onClick={closeSidebar}
          >
            {item.icon}
            <span>{t(item.labelKey)}</span>
          </Link>
        ))}
      </nav>
      <SidebarAccount />
    </>
  )
}
