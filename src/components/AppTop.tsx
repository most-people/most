import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

type AppTopProps = {
  onNavigate?: () => void
  logo?: ReactNode
}

export function AppTop({ onNavigate, logo }: AppTopProps) {
  const { t } = useI18n()
  const brand = t('common.brand')

  if (logo) {
    return <div className="sidebar-header sidebar-header-static">{logo}</div>
  }

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
