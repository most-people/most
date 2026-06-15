import '~/styles/marketing.css'

import type { ReactNode } from 'react'
import { Nav } from '~/components/Nav'
import { Footer } from '~/components/Footer'

interface MarketingLayoutProps {
  children: ReactNode
  header?: ReactNode
}

export function MarketingLayout({ children, header }: MarketingLayoutProps) {
  return (
    <div className="mkt-layout">
      {header ?? <Nav />}
      <main className="mkt-layout-main">{children}</main>
      <Footer />
    </div>
  )
}
