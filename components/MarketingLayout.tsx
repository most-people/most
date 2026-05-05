import '~/styles/marketing.css'

import { Nav } from '~/components/Nav'
import { Footer } from '~/components/Footer'

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-layout">
      <Nav />
      <main className="mkt-layout-main">{children}</main>
      <Footer />
    </div>
  )
}
