import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { LanguageToggle } from '~/components/LanguageToggle'
import { MarketingThemeToggle } from '~/components/MarketingThemeToggle'

export function MarketingHeader() {
  const navigate = useNavigate()

  function goBackOrHome() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    navigate({ to: '/' })
  }

  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <button
          type="button"
          className="mkt-nav-logo"
          onClick={goBackOrHome}
        >
          <ArrowLeft size={18} />
          <span>MOST PEOPLE</span>
        </button>
        <div className="mkt-nav-cta">
          <MarketingThemeToggle />
          <LanguageToggle className="mkt-theme-toggle" />
        </div>
      </div>
    </nav>
  )
}
