import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { LanguageToggle } from '~/components/LanguageToggle'
import { MarketingThemeToggle } from '~/components/MarketingThemeToggle'

export function MarketingHeader() {
  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <Link to="/" className="mkt-nav-logo">
          <ArrowLeft size={18} />
          <span>MOST PEOPLE</span>
        </Link>
        <div className="mkt-nav-cta">
          <MarketingThemeToggle />
          <LanguageToggle className="mkt-theme-toggle" />
        </div>
      </div>
    </nav>
  )
}
