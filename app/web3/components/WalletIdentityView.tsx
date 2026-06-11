import { Eye, EyeOff, ExternalLink, Fingerprint, Globe, KeyRound, Shield, User } from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import { EmptyState } from '~/components/EmptyState'
import { KeyCard } from '~/components/KeyCard'
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
  const effectiveAddress = walletResult?.address || ''

  if (!walletResult || !effectiveAddress) {
    return (
      <EmptyState
        icon={<User size={36} />}
        message="请输入用户名和密码以查看身份信息"
      />
    )
  }

  return (
    <>
      <div className="web3-identity-card">
        <img src={avatarSrc} alt="avatar" className="web3-identity-avatar" />
        <div>
          <h1 className="web3-identity-name">
            {walletResult.username || '未登录'}
          </h1>
          <div className="web3-identity-address">
            <code>{effectiveAddress.toLowerCase()}</code>
            <CopyButton text={effectiveAddress.toLowerCase()} />
            <a
              href={`https://debank.com/profile/${effectiveAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              <ExternalLink size={14} />
              查看
            </a>
          </div>
        </div>
      </div>

      {keys && (
        <div className="web3-key-grid">
          <KeyCard title="Ed25519 公钥" icon={<Fingerprint size={18} />}>
            <div className="mono-row">
              <code className="mono">{keys.ed_public_key}</code>
              <CopyButton text={keys.ed_public_key} />
            </div>
          </KeyCard>

          <KeyCard title="x25519 公钥" icon={<KeyRound size={18} />}>
            <div className="mono-row">
              <code className="mono">{keys.public_key}</code>
              <CopyButton text={keys.public_key} />
            </div>
          </KeyCard>

          <KeyCard title="x25519 & Ed25519 私钥" icon={<Shield size={18} />} accent>
            <div className="mono-row danger">
              <code className="mono">
                {showPrivateKey
                  ? keys.private_key
                  : maskSecret(keys.private_key)}
              </code>
              <button
                className="btn btn-icon"
                onClick={onTogglePrivateKey}
                title={showPrivateKey ? '隐藏私钥' : '显示私钥'}
                type="button"
              >
                {showPrivateKey ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </KeyCard>

          <KeyCard title="IPNS ID" icon={<Globe size={18} />}>
            <div className="mono-row">
              <code className="mono">{ipns}</code>
              <CopyButton text={ipns} />
            </div>
          </KeyCard>
        </div>
      )}
    </>
  )
}
