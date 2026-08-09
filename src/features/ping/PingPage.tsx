import { useMemo, useState } from 'react'
import { PingPanel } from '~/components/PingPanel'
import { P2PPingPanel } from '~/components/P2PPingPanel'
import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { SegmentedControl } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

type PingMode = 'internet' | 'p2p'

export default function PingPage() {
  const { t } = useI18n()
  const [mode, setMode] = useState<PingMode>('internet')
  const options = useMemo(
    () => [
      { value: 'internet' as const, label: t('ping.mode.internet') },
      { value: 'p2p' as const, label: t('ping.mode.p2p') },
    ],
    [t]
  )

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="ping-page">
        <SegmentedControl<PingMode>
          ariaLabel={t('ping.mode.label')}
          className="ping-mode-control"
          options={options}
          value={mode}
          onChange={setMode}
        />
        {mode === 'internet' ? <PingPanel /> : <P2PPingPanel />}
      </div>
    </MarketingLayout>
  )
}
