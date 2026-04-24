'use client'

import '~/styles/ping.css'

import { PingPanel } from '~/components/PingPanel'
import { MarketingLayout } from '~/components/MarketingLayout'

export default function PingPage() {
  return (
    <MarketingLayout>
      <PingPanel />
    </MarketingLayout>
  )
}
