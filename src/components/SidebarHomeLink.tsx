import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

type SidebarHomeLinkProps = {
  onNavigate?: () => void
}

export function SidebarHomeLink({ onNavigate }: SidebarHomeLinkProps) {
  const { t } = useI18n()
  const brand = t('common.brand')

  return (
    <Link
      to="/"
      className="sidebar-header sidebar-header-link"
      onClick={onNavigate}
      aria-label={brand}
      title={brand}
    >
      <ArrowLeft size={18} />
      <h1>{brand}</h1>
    </Link>
  )
}
