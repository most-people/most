import { Eye, EyeOff, Wallet } from 'lucide-react'

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
  return (
    <div className="input-panel">
      <div className="web3-tools-inputs">
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
            生成中...
          </>
        ) : (
          <>
            <Wallet size={16} />
            生成并登录
          </>
        )}
      </button>
    </div>
  )
}
