import { Link } from '@tanstack/react-router'
import { ArrowLeft, Spade, Swords } from 'lucide-react'
import SidebarAccount from '~/components/SidebarAccount'

type GameSidebarProps = {
  activeGame: 'gandengyan' | 'zhajinhua'
  closeSidebar: () => void
}

const items = [
  {
    id: 'gandengyan',
    label: '干瞪眼',
    href: '/game/gandengyan/',
    icon: <Swords size={16} />,
  },
  {
    id: 'zhajinhua',
    label: '炸金花',
    href: '/game/zhajinhua/',
    icon: <Spade size={16} />,
  },
] as const

export default function GameSidebar({
  activeGame,
  closeSidebar,
}: GameSidebarProps) {
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
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <SidebarAccount />
    </>
  )
}
