import { KeyRound, Lock } from 'lucide-react'
import { parseMostBoxToken } from '~/server/src/utils/mostWallet.js'

type BoxFlowPanelProps = {
  title: string
  description: string
  message: string
  cipherText: string
  decryptedText: string
  error: string
  encryptLabel: string
  decryptLabel: string
  messagePlaceholder: string
  cipherPlaceholder: string
  onMessageChange: (value: string) => void
  onCipherTextChange: (value: string) => void
  onEncrypt: () => void
  onDecrypt: () => void
}

function formatBoxTimestamp(timestampMs: number) {
  if (!Number.isFinite(timestampMs)) return '-'
  return `${new Date(timestampMs).toLocaleString()}`
}

export function BoxFlowPanel({
  title,
  description,
  message,
  cipherText,
  decryptedText,
  error,
  encryptLabel,
  decryptLabel,
  messagePlaceholder,
  cipherPlaceholder,
  onMessageChange,
  onCipherTextChange,
  onEncrypt,
  onDecrypt,
}: BoxFlowPanelProps) {
  const messageInputId = `box-message-${title.replaceAll(/\s+/g, '-')}`
  const tokenInfo = parseMostBoxToken(cipherText)

  return (
    <section className="web3-box-flow">
      <div className="web3-box-flow-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <label className="web3-box-label" htmlFor={messageInputId}>
        明文
      </label>
      <textarea
        id={messageInputId}
        className="textarea"
        value={message}
        onChange={event => onMessageChange(event.target.value)}
        rows={4}
        placeholder={messagePlaceholder}
      />

      <div className="web3-box-actions">
        <button className="btn btn-primary" onClick={onEncrypt} type="button">
          <Lock size={16} />
          {encryptLabel}
        </button>
        <button className="btn btn-secondary" onClick={onDecrypt} type="button">
          <KeyRound size={16} />
          {decryptLabel}
        </button>
      </div>

      {error && <p className="web3-tools-danger">{error}</p>}

      <div className="web3-box-result-grid">
        <div className="web3-box-result">
          <label className="web3-box-result-header">
            <span>密文</span>
          </label>
          <textarea
            className="textarea mono"
            value={cipherText}
            onChange={event => onCipherTextChange(event.target.value)}
            rows={5}
            placeholder={cipherPlaceholder}
          />
        </div>

        <div className="web3-box-result">
          <label className="web3-box-result-header">
            <span>解密结果</span>
          </label>
          <textarea
            className="textarea mono"
            value={decryptedText}
            readOnly
            rows={5}
            placeholder="解密成功后显示明文"
          />
        </div>
      </div>

      {tokenInfo && (
        <div className="web3-box-token-meta">
          <div className="web3-box-token-meta-row">
            <span>时间戳</span>
            <code>{formatBoxTimestamp(tokenInfo.timestampMs)}</code>
          </div>
          <div className="web3-box-token-meta-row">
            <span>随机数</span>
            <code>{tokenInfo.nonce}</code>
          </div>
        </div>
      )}
    </section>
  )
}
