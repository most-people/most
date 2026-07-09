import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import { useI18n } from '~/lib/i18n'
import type { BoxAccount } from './types'

type BoxAccountPanelProps = {
  title: string
  username: string
  password: string
  showPassword: boolean
  showPrivateKey: boolean
  account: BoxAccount | null
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onTogglePrivateKey: () => void
  onGenerate: () => void
}

function maskSecret(value: string) {
  return value ? '•'.repeat(Math.min(value.length, 32)) : '-'
}

export function BoxAccountPanel({
  title,
  username,
  password,
  showPassword,
  showPrivateKey,
  account,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onTogglePrivateKey,
  onGenerate,
}: BoxAccountPanelProps) {
  const { t } = useI18n()

  return (
    <div className="web3-box-account">
      <div className="web3-box-account-header">
        <div>
          <h2>{title}</h2>
          <p>{t('web3.box.account.desc')}</p>
        </div>
      </div>
      <div className="web3-box-login">
        <input
          type="text"
          placeholder={t('login.username.placeholder')}
          value={username}
          onChange={event => onUsernameChange(event.target.value)}
          className="input"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <div className="input-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder={t('web3.login.passwordOptional')}
            value={password}
            onChange={event => onPasswordChange(event.target.value)}
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <button
            className="input-eye"
            onClick={onTogglePassword}
            type="button"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          className="btn btn-primary btn-full"
          onClick={onGenerate}
          disabled={!username.trim()}
          type="button"
        >
          <KeyRound size={16} />
          {t('web3.box.account.generate')}
        </button>
      </div>

      {account ? (
        <div className="web3-box-key-list">
          <div className="web3-box-key-row">
            <span>{t('web3.label.address')}</span>
            <div className="mono-row">
              <code className="mono" translate="no">
                {account.address.toLowerCase()}
              </code>
              <CopyButton text={account.address.toLowerCase()} />
            </div>
          </div>
          <div className="web3-box-key-row">
            <span>{t('web3.label.x25519Public')}</span>
            <div className="mono-row">
              <code className="mono" translate="no">
                {account.publicKey}
              </code>
              <CopyButton text={account.publicKey} />
            </div>
          </div>
          <div className="web3-box-key-row">
            <span>{t('web3.label.x25519Private')}</span>
            <div className="mono-row danger">
              <code className="mono" translate="no">
                {showPrivateKey
                  ? account.privateKey
                  : maskSecret(account.privateKey)}
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
          </div>
        </div>
      ) : null}
    </div>
  )
}
