import { useState } from 'react'
import { Eye, EyeOff, Settings, Wallet } from 'lucide-react'
import { useI18n } from '~/lib/i18n'
import {
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
} from '~server/src/utils/mostWallet.js'

type Web3LoginPanelProps = {
  username: string
  password: string
  showPassword: boolean
  pbkdf2Iterations: string
  pbkdf2IterationsValid: boolean
  generating: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onPbkdf2IterationsChange: (value: string) => void
  onTogglePassword: () => void
  onGenerate: () => void
}

export function Web3LoginPanel({
  username,
  password,
  showPassword,
  pbkdf2Iterations,
  pbkdf2IterationsValid,
  generating,
  onUsernameChange,
  onPasswordChange,
  onPbkdf2IterationsChange,
  onTogglePassword,
  onGenerate,
}: Web3LoginPanelProps) {
  const { t } = useI18n()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="input-panel web3-login-panel">
      <button
        className="btn btn-icon web3-login-settings-toggle"
        onClick={() => setShowSettings(value => !value)}
        type="button"
        aria-expanded={showSettings}
        aria-controls="web3-login-settings"
        aria-label={t('web3.login.settings')}
        title={t('web3.login.settings')}
      >
        <Settings size={17} />
      </button>
      {showSettings && (
        <div className="web3-login-settings" id="web3-login-settings">
          <label htmlFor="web3-pbkdf2-iterations">
            {t('web3.login.iterations')}
          </label>
          <input
            id="web3-pbkdf2-iterations"
            className="input"
            type="number"
            min={MIN_PBKDF2_ITERATIONS}
            max={MAX_PBKDF2_ITERATIONS}
            step="1"
            inputMode="numeric"
            value={pbkdf2Iterations}
            onChange={event => onPbkdf2IterationsChange(event.target.value)}
            aria-invalid={!pbkdf2IterationsValid}
            aria-describedby={
              pbkdf2IterationsValid ? undefined : 'web3-pbkdf2-iterations-error'
            }
          />
          {!pbkdf2IterationsValid && (
            <span
              className="web3-login-settings-error"
              id="web3-pbkdf2-iterations-error"
              role="alert"
            >
              {t('web3.login.iterationsError', {
                min: MIN_PBKDF2_ITERATIONS,
                max: MAX_PBKDF2_ITERATIONS,
              })}
            </span>
          )}
        </div>
      )}
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
          <button
            className="input-eye"
            onClick={onTogglePassword}
            type="button"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button
        className="btn btn-primary btn-full"
        onClick={onGenerate}
        disabled={!username.trim() || !pbkdf2IterationsValid || generating}
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
