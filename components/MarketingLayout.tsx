import '../styles/marketing.css'

import { Nav } from './Nav'
import { Footer } from './Footer'

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  )
}
