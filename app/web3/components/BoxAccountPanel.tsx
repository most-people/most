import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
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
  return (
    <div className="web3-box-account">
      <div className="web3-box-account-header">
        <div>
          <h2>{title}</h2>
          <p>用户名和密码会确定性生成 x25519 密钥对。</p>
        </div>
      </div>
      <div className="web3-box-login">
        <input
          type="text"
          placeholder="用户名"
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
            placeholder="密码（可选）"
            value={password}
            onChange={event => onPasswordChange(event.target.value)}
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <button className="input-eye" onClick={onTogglePassword} type="button">
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
          生成账号
        </button>
      </div>

      {account ? (
        <div className="web3-box-key-list">
          <div className="web3-box-key-row">
            <span>地址</span>
            <div className="mono-row">
              <code className="mono">{account.address.toLowerCase()}</code>
              <CopyButton text={account.address.toLowerCase()} />
            </div>
          </div>
          <div className="web3-box-key-row">
            <span>x25519 公钥</span>
            <div className="mono-row">
              <code className="mono">{account.publicKey}</code>
              <CopyButton text={account.publicKey} />
            </div>
          </div>
          <div className="web3-box-key-row">
            <span>x25519 私钥</span>
            <div className="mono-row danger">
              <code className="mono">
                {showPrivateKey
                  ? account.privateKey
                  : maskSecret(account.privateKey)}
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
          </div>
        </div>
      ) : null}
    </div>
  )
}
