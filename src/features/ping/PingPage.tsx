import { PingPanel } from '~/components/PingPanel'
import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'

export default function PingPage() {
  return (
    <MarketingLayout header={<MarketingHeader />}>
      <PingPanel />
    </MarketingLayout>
  )
}
