import '~/styles/marketing.css'

import { Nav } from '~/components/Nav'
import { Footer } from '~/components/Footer'

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  )
}
