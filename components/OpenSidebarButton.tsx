import { PanelLeftOpen } from 'lucide-react'
import { useAppShell } from '~/components/AppShell'
import { useI18n } from '~/lib/i18n'

interface OpenSidebarButtonProps {
  label?: string
  className?: string
  variant?: 'default' | 'primary'
}

export default function OpenSidebarButton({
  label,
  className = '',
  variant = 'primary',
}: OpenSidebarButtonProps) {
  const { isSidebarVisible, openSidebar } = useAppShell()
  const { t } = useI18n()
  const variantClass = variant === 'primary' ? 'btn-primary' : ''
  const buttonLabel = label || t('appShell.openSidebar')

  if (isSidebarVisible) return null

  return (
    <button
      type="button"
      className={`btn ${variantClass} sidebar-open-hint ${className}`.trim()}
      onClick={openSidebar}
    >
      <PanelLeftOpen size={16} />
      {buttonLabel}
    </button>
  )
}
