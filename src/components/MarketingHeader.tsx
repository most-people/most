import { ArrowLeft } from 'lucide-react'
import { DesktopUpdateButton } from '~/components/DesktopUpdateButton'
import { LanguageToggle } from '~/components/LanguageToggle'
import { MarketingThemeToggle } from '~/components/MarketingThemeToggle'
import { useBack } from '~/hooks/useBack'

export function MarketingHeader() {
  const back = useBack()

  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <button
          type="button"
          className="mkt-nav-logo"
          onClick={back}
        >
          <ArrowLeft size={18} />
          <span>MOST PEOPLE</span>
        </button>
        <div className="mkt-nav-cta">
          <MarketingThemeToggle />
          <LanguageToggle className="mkt-theme-toggle" />
          <DesktopUpdateButton />
        </div>
      </div>
    </nav>
  )
}
