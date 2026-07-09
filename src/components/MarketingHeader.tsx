import { ArrowLeft } from 'lucide-react'
import { AppearanceToggle } from '~/components/AppearanceToggle'
import { LanguageToggle } from '~/components/LanguageToggle'
import { AccountMenuButton } from '~/features/profile/AccountMenu'
import { useBack } from '~/hooks/useBack'

export function MarketingHeader() {
  const back = useBack()

  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <button type="button" className="mkt-nav-logo" onClick={back}>
          <ArrowLeft size={18} />
          <span>MOST PEOPLE</span>
        </button>
        <div className="mkt-nav-cta">
          <AppearanceToggle />
          <LanguageToggle />
          <AccountMenuButton />
        </div>
      </div>
    </nav>
  )
}
