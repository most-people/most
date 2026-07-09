import { Lock } from 'lucide-react'
import { EmptyState } from '~/components/EmptyState'
import { PemBlock } from '~/components/PemBlock'
import { useI18n } from '~/lib/i18n'
import type { WalletResult } from './types'

type PemExportViewProps = {
  walletResult: WalletResult | null
  publicPem: string
  privatePem: string
}

export function PemExportView({
  walletResult,
  publicPem,
  privatePem,
}: PemExportViewProps) {
  const { t } = useI18n()

  if (!publicPem || !privatePem) {
    return (
      <EmptyState icon={<Lock size={36} />} message={t('web3.empty.pem')} />
    )
  }

  const baseName = walletResult?.username || 'wallet'

  return (
    <div className="web3-pem-list">
      <PemBlock
        label={`${baseName}.pub`}
        pem={publicPem}
        filename={`${baseName}.pub`}
      />
      <PemBlock
        label={`${baseName}.pem`}
        pem={privatePem}
        filename={`${baseName}.pem`}
      />
    </div>
  )
}
