import { Lock } from 'lucide-react'
import { EmptyState } from '~/components/EmptyState'
import { PemBlock } from '~/components/PemBlock'
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
  if (!publicPem || !privatePem) {
    return (
      <EmptyState
        icon={<Lock size={36} />}
        message="请输入用户名和密码以生成 PEM 密钥"
      />
    )
  }

  const baseName = walletResult?.username || 'wallet'

  return (
    <div className="web3-pem-list">
      <PemBlock label={`${baseName}.pub`} pem={publicPem} filename={`${baseName}.pub`} />
      <PemBlock label={`${baseName}.pem`} pem={privatePem} filename={`${baseName}.pem`} />
    </div>
  )
}
