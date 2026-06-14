import { Eye, EyeOff, Wallet } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

type Web3LoginPanelProps = {
  username: string
  password: string
  showPassword: boolean
  generating: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onGenerate: () => void
}

export function Web3LoginPanel({
  username,
  password,
  showPassword,
  generating,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onGenerate,
}: Web3LoginPanelProps) {
  const { t } = useI18n()

  return (
    <div className="input-panel">
      <div className="web3-tools-inputs">
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
          <button className="input-eye" onClick={onTogglePassword} type="button">
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button
        className="btn btn-primary btn-full"
        onClick={onGenerate}
        disabled={!username.trim() || generating}
        type="button"
      >
        {generating ? (
          <>
            <span className="spinner" />
            {t('web3.login.generating')}
          </>
        ) : (
          <>
            <Wallet size={16} />
            {t('web3.login.generateAndSignIn')}
          </>
        )}
      </button>
    </div>
  )
}
