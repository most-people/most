import '~/styles/marketing.css'

import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Footer } from '~/components/Footer'
import { LanguageToggle } from '~/components/LanguageToggle'
import { MarketingThemeToggle } from '~/components/MarketingThemeToggle'
import { LogoIcon } from '~/components/icons/LogoIcon'
import { useIsDesktopClient } from '~/hooks'
import { useI18n } from '~/lib/i18n'
import { useUserStore } from '~/stores/userStore'
import { generateAvatar } from '~server/src/utils/avatar.js'

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
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const { t } = useI18n()
  const isDesktopClient = useIsDesktopClient()
  const identityLabel =
    identity?.displayName || identity?.username || t('nav.openWeb')

  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <Link to="/" className="mkt-nav-logo">
          <LogoIcon />
          MOST PEOPLE
        </Link>

        <div className="mkt-nav-cta">
          <MarketingThemeToggle />
          <LanguageToggle className="mkt-theme-toggle" />
          {!isDesktopClient && (
            <Link to="/download/" className="btn btn-primary mkt-nav-preview">
              <Download size={16} />
              {t('nav.downloadClient')}
            </Link>
          )}
          {identity ? (
            <Link
              to="/profile/"
              className="mkt-nav-avatar-trigger"
              aria-label={t('nav.profile')}
              title={identityLabel}
            >
              <img
                className="mkt-nav-avatar"
                src={generateAvatar(identity.address, identity.avatar)}
                alt=""
                aria-hidden="true"
              />
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openLoginModal}
            >
              {t('nav.getStarted')}
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
