import {
  Eye,
  EyeOff,
  ExternalLink,
  Fingerprint,
  Globe,
  KeyRound,
  Shield,
  User,
} from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import { EmptyState } from '~/components/EmptyState'
import { KeyCard } from '~/components/KeyCard'
import { useI18n } from '~/lib/i18n'
import type { MostKeySet, WalletResult } from './types'

type WalletIdentityViewProps = {
  walletResult: WalletResult | null
  keys: MostKeySet | null
  ipns: string
  avatarSrc: string
  showPrivateKey: boolean
  onTogglePrivateKey: () => void
}

function maskSecret(value: string) {
  return value ? '•'.repeat(Math.min(value.length, 32)) : '-'
}

export function WalletIdentityView({
  walletResult,
  keys,
  ipns,
  avatarSrc,
  showPrivateKey,
  onTogglePrivateKey,
}: WalletIdentityViewProps) {
  const { t } = useI18n()
  const effectiveAddress = walletResult?.address || ''

  if (!walletResult || !effectiveAddress) {
    return (
      <EmptyState
        icon={<User size={36} />}
        message={t('web3.empty.identity')}
      />
    )
  }

  return (
    <>
      <div className="web3-identity-card">
        <img src={avatarSrc} alt="avatar" className="web3-identity-avatar" />
        <div>
          <h1 className="web3-identity-name">
            {walletResult.username || t('web3.notSignedIn')}
          </h1>
          <div className="web3-identity-address">
            <code translate="no">{effectiveAddress.toLowerCase()}</code>
            <CopyButton text={effectiveAddress.toLowerCase()} />
            <a
              href={`https://debank.com/profile/${effectiveAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              <ExternalLink size={14} />
              {t('web3.action.view')}
            </a>
          </div>
        </div>
      </div>

      {keys && (
        <div className="web3-key-grid">
          <KeyCard
            title={t('web3.label.ed25519Public')}
            icon={<Fingerprint size={18} />}
          >
            <div className="mono-row">
              <code className="mono" translate="no">
                {keys.ed_public_key}
              </code>
              <CopyButton text={keys.ed_public_key} />
            </div>
          </KeyCard>

          <KeyCard
            title={t('web3.label.x25519Public')}
            icon={<KeyRound size={18} />}
          >
            <div className="mono-row">
              <code className="mono" translate="no">
                {keys.public_key}
              </code>
              <CopyButton text={keys.public_key} />
            </div>
          </KeyCard>

          <KeyCard
            title={t('web3.label.combinedPrivate')}
            icon={<Shield size={18} />}
            accent
          >
            <div className="mono-row danger">
              <code className="mono" translate="no">
                {showPrivateKey
                  ? keys.private_key
                  : maskSecret(keys.private_key)}
              </code>
              <button
                className="btn btn-icon"
                onClick={onTogglePrivateKey}
                title={
                  showPrivateKey
                    ? t('web3.action.hidePrivateKey')
                    : t('web3.action.showPrivateKey')
                }
                type="button"
              >
                {showPrivateKey ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </KeyCard>

          <KeyCard title="IPNS ID" icon={<Globe size={18} />}>
            <div className="mono-row">
              <code className="mono" translate="no">
                {ipns}
              </code>
              <CopyButton text={ipns} />
            </div>
          </KeyCard>
        </div>
      )}
    </>
  )
}
