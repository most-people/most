import { PanelLeftOpen } from 'lucide-react'
import { useAppShell } from '~/components/AppShell'

interface OpenSidebarButtonProps {
  label?: string
  className?: string
  variant?: 'default' | 'primary'
}

export default function OpenSidebarButton({
  label = '打开侧边栏',
  className = '',
  variant = 'primary',
}: OpenSidebarButtonProps) {
  const { isSidebarVisible, openSidebar } = useAppShell()
  const variantClass = variant === 'primary' ? 'btn-primary' : ''

  if (isSidebarVisible) return null

  return (
    <button
      type="button"
      className={`btn ${variantClass} sidebar-open-hint ${className}`.trim()}
      onClick={openSidebar}
    >
      <PanelLeftOpen size={16} />
      {label}
    </button>
  )
}
