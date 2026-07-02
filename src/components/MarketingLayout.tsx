import '~/styles/marketing.css'

import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { AppearanceToggle } from '~/components/AppearanceToggle'
import { Footer } from '~/components/Footer'
import { LogoIcon } from '~/components/icons/LogoIcon'
import { LanguageToggle } from '~/components/LanguageToggle'
import { AccountMenuButton } from '~/features/profile/AccountMenu'
import { useIsDesktopClient } from '~/hooks'
import { useI18n } from '~/lib/i18n'

interface MarketingLayoutProps {
  children: ReactNode
  header?: ReactNode
}

export function MarketingLayout({ children, header }: MarketingLayoutProps) {
  return (
    <div className="mkt-layout">
      {header ?? <DefaultMarketingHeader />}
      <main className="mkt-layout-main">{children}</main>
      <Footer />
    </div>
  )
}

function DefaultMarketingHeader() {
  const { t } = useI18n()
  const isDesktopClient = useIsDesktopClient()

  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <Link to="/" className="mkt-nav-logo">
          <LogoIcon />
          MOST PEOPLE
        </Link>

        <div className="mkt-nav-cta">
          <AppearanceToggle />
          <LanguageToggle />
          {!isDesktopClient && (
            <Link to="/download/" className="btn btn-primary mkt-nav-preview">
              <Download size={16} />
              {t('nav.downloadClient')}
            </Link>
          )}
          <AccountMenuButton />
        </div>
      </div>
    </nav>
  )
}
