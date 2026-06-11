import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react'
import { BoxAccountPanel } from './BoxAccountPanel'
import { BoxFlowPanel } from './BoxFlowPanel'
import type { BoxAccount } from './types'

type AsymmetricBoxViewProps = {
  boxAUsername: string
  boxAPassword: string
  boxAShowPassword: boolean
  boxAShowPrivateKey: boolean
  boxAAccount: BoxAccount | null
  boxBUsername: string
  boxBPassword: string
  boxBShowPassword: boolean
  boxBShowPrivateKey: boolean
  boxBAccount: BoxAccount | null
  boxABMessage: string
  boxABCipherText: string
  boxABDecryptedText: string
  boxABError: string
  boxBAMessage: string
  boxBACipherText: string
  boxBADecryptedText: string
  boxBAError: string
  boxEncryptSenderPrivateKey: string
  boxEncryptRecipientPublicKey: string
  boxEncryptMessage: string
  boxEncryptCipherText: string
  boxEncryptError: string
  boxEncryptShowPrivateKey: boolean
  boxDecryptSenderPublicKey: string
  boxDecryptRecipientPrivateKey: string
  boxDecryptCipherText: string
  boxDecryptResult: string
  boxDecryptError: string
  boxDecryptShowPrivateKey: boolean
  onBoxAUsernameChange: (value: string) => void
  onBoxAPasswordChange: (value: string) => void
  onBoxAShowPasswordToggle: () => void
  onBoxAShowPrivateKeyToggle: () => void
  onGenerateBoxA: () => void
  onBoxBUsernameChange: (value: string) => void
  onBoxBPasswordChange: (value: string) => void
  onBoxBShowPasswordToggle: () => void
  onBoxBShowPrivateKeyToggle: () => void
  onGenerateBoxB: () => void
  onBoxABMessageChange: (value: string) => void
  onBoxABCipherTextChange: (value: string) => void
  onEncryptBoxAB: () => void
  onDecryptBoxAB: () => void
  onBoxBAMessageChange: (value: string) => void
  onBoxBACipherTextChange: (value: string) => void
  onEncryptBoxBA: () => void
  onDecryptBoxBA: () => void
  onBoxEncryptSenderPrivateKeyChange: (value: string) => void
  onBoxEncryptRecipientPublicKeyChange: (value: string) => void
  onBoxEncryptMessageChange: (value: string) => void
  onBoxEncryptShowPrivateKeyToggle: () => void
  onEncryptOnly: () => void
  onBoxDecryptSenderPublicKeyChange: (value: string) => void
  onBoxDecryptRecipientPrivateKeyChange: (value: string) => void
  onBoxDecryptCipherTextChange: (value: string) => void
  onBoxDecryptShowPrivateKeyToggle: () => void
  onDecryptOnly: () => void
}

export function AsymmetricBoxView(props: AsymmetricBoxViewProps) {
  return (
    <div className="web3-box-workspace">
      <div className="web3-box-grid">
        <BoxAccountPanel
          title="A 账号"
          username={props.boxAUsername}
          password={props.boxAPassword}
          showPassword={props.boxAShowPassword}
          showPrivateKey={props.boxAShowPrivateKey}
          account={props.boxAAccount}
          onUsernameChange={props.onBoxAUsernameChange}
          onPasswordChange={props.onBoxAPasswordChange}
          onTogglePassword={props.onBoxAShowPasswordToggle}
          onTogglePrivateKey={props.onBoxAShowPrivateKeyToggle}
          onGenerate={props.onGenerateBoxA}
        />
        <BoxAccountPanel
          title="B 账号"
          username={props.boxBUsername}
          password={props.boxBPassword}
          showPassword={props.boxBShowPassword}
          showPrivateKey={props.boxBShowPrivateKey}
          account={props.boxBAccount}
          onUsernameChange={props.onBoxBUsernameChange}
          onPasswordChange={props.onBoxBPasswordChange}
          onTogglePassword={props.onBoxBShowPasswordToggle}
          onTogglePrivateKey={props.onBoxBShowPrivateKeyToggle}
          onGenerate={props.onGenerateBoxB}
        />
      </div>

      <div className="web3-box-flow-grid">
        <BoxFlowPanel
          title="A → B"
          description="加密使用 A 私钥 + B 公钥；解密使用 A 公钥 + B 私钥。"
          message={props.boxABMessage}
          cipherText={props.boxABCipherText}
          decryptedText={props.boxABDecryptedText}
          error={props.boxABError}
          encryptLabel="用 A 私钥 + B 公钥加密"
          decryptLabel="用 A 公钥 + B 私钥解密"
          messagePlaceholder="输入要从 A 发给 B 的消息"
          cipherPlaceholder="加密后生成密文，或粘贴已有密文"
          onMessageChange={props.onBoxABMessageChange}
          onCipherTextChange={props.onBoxABCipherTextChange}
          onEncrypt={props.onEncryptBoxAB}
          onDecrypt={props.onDecryptBoxAB}
        />

        <BoxFlowPanel
          title="B → A"
          description="加密使用 B 私钥 + A 公钥；解密使用 B 公钥 + A 私钥。"
          message={props.boxBAMessage}
          cipherText={props.boxBACipherText}
          decryptedText={props.boxBADecryptedText}
          error={props.boxBAError}
          encryptLabel="用 B 私钥 + A 公钥加密"
          decryptLabel="用 B 公钥 + A 私钥解密"
          messagePlaceholder="输入要从 B 发给 A 的消息"
          cipherPlaceholder="加密后生成密文，或粘贴已有密文"
          onMessageChange={props.onBoxBAMessageChange}
          onCipherTextChange={props.onBoxBACipherTextChange}
          onEncrypt={props.onEncryptBoxBA}
          onDecrypt={props.onDecryptBoxBA}
        />
      </div>

      <div className="web3-box-flow-grid">
        <section className="web3-box-flow">
          <div className="web3-box-flow-header">
            <div>
              <h2>加密</h2>
              <p>只输入发送方私钥和接收方公钥即可加密，无需生成完整账号。</p>
            </div>
          </div>

          <label className="web3-box-result-header">
            <span>发送方</span>
          </label>
          <div className="input-wrap">
            <input
              type={props.boxEncryptShowPrivateKey ? 'text' : 'password'}
              placeholder="发送方 x25519 私钥"
              value={props.boxEncryptSenderPrivateKey}
              onChange={event =>
                props.onBoxEncryptSenderPrivateKeyChange(event.target.value)
              }
              className="input"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <button
              className="input-eye"
              onClick={props.onBoxEncryptShowPrivateKeyToggle}
              type="button"
            >
              {props.boxEncryptShowPrivateKey ? (
                <EyeOff size={16} />
              ) : (
                <Eye size={16} />
              )}
            </button>
          </div>
          <label className="web3-box-result-header">
            <span>接收方</span>
          </label>
          <input
            type="text"
            placeholder="接收方 x25519 公钥"
            value={props.boxEncryptRecipientPublicKey}
            onChange={event =>
              props.onBoxEncryptRecipientPublicKeyChange(event.target.value)
            }
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />

          <label className="web3-box-result-header">
            <span>明文</span>
          </label>
          <textarea
            className="textarea"
            value={props.boxEncryptMessage}
            onChange={event => props.onBoxEncryptMessageChange(event.target.value)}
            rows={4}
            placeholder="输入要加密的消息"
          />

          <div className="web3-box-actions">
            <button
              className="btn btn-primary"
              onClick={props.onEncryptOnly}
              type="button"
            >
              <Lock size={16} />
              加密
            </button>
          </div>

          {props.boxEncryptError && (
            <p className="web3-tools-danger">{props.boxEncryptError}</p>
          )}

          <div className="web3-box-result">
            <label className="web3-box-result-header">
              <span>密文</span>
            </label>
            <textarea
              className="textarea mono"
              value={props.boxEncryptCipherText}
              readOnly
              rows={5}
              placeholder="加密成功后显示密文"
            />
          </div>
        </section>

        <section className="web3-box-flow">
          <div className="web3-box-flow-header">
            <div>
              <h2>解密</h2>
              <p>只输入发送方公钥和接收方私钥即可解密，无需生成完整账号。</p>
            </div>
          </div>

          <label className="web3-box-result-header">
            <span>发送方</span>
          </label>
          <input
            type="text"
            placeholder="发送方 x25519 公钥"
            value={props.boxDecryptSenderPublicKey}
            onChange={event =>
              props.onBoxDecryptSenderPublicKeyChange(event.target.value)
            }
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <label className="web3-box-result-header">
            <span>接收方</span>
          </label>
          <div className="input-wrap">
            <input
              type={props.boxDecryptShowPrivateKey ? 'text' : 'password'}
              placeholder="接收方 x25519 私钥"
              value={props.boxDecryptRecipientPrivateKey}
              onChange={event =>
                props.onBoxDecryptRecipientPrivateKeyChange(event.target.value)
              }
              className="input"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <button
              className="input-eye"
              onClick={props.onBoxDecryptShowPrivateKeyToggle}
              type="button"
            >
              {props.boxDecryptShowPrivateKey ? (
                <EyeOff size={16} />
              ) : (
                <Eye size={16} />
              )}
            </button>
          </div>

          <label className="web3-box-result-header">
            <span>密文</span>
          </label>
          <textarea
            className="textarea mono"
            value={props.boxDecryptCipherText}
            onChange={event => props.onBoxDecryptCipherTextChange(event.target.value)}
            rows={5}
            placeholder="粘贴要解密的密文"
          />

          <div className="web3-box-actions">
            <button
              className="btn btn-secondary"
              onClick={props.onDecryptOnly}
              type="button"
            >
              <KeyRound size={16} />
              解密
            </button>
          </div>

          {props.boxDecryptError && (
            <p className="web3-tools-danger">{props.boxDecryptError}</p>
          )}

          <div className="web3-box-result">
            <label className="web3-box-result-header">
              <span>解密结果</span>
            </label>
            <textarea
              className="textarea mono"
              value={props.boxDecryptResult}
              readOnly
              rows={5}
              placeholder="解密成功后显示明文"
            />
          </div>
        </section>
      </div>
    </div>
  )
}
