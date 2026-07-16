import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react'
import { useI18n } from '~/lib/i18n'
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
  const { t } = useI18n()

  return (
    <div className="web3-box-workspace">
      <div className="web3-box-grid">
        <BoxAccountPanel
          title={t('web3.box.accountA')}
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
          title={t('web3.box.accountB')}
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
          description={t('web3.box.flowAB.desc')}
          message={props.boxABMessage}
          cipherText={props.boxABCipherText}
          decryptedText={props.boxABDecryptedText}
          error={props.boxABError}
          encryptLabel={t('web3.box.flowAB.encrypt')}
          decryptLabel={t('web3.box.flowAB.decrypt')}
          messagePlaceholder={t('web3.box.flowAB.messagePlaceholder')}
          cipherPlaceholder={t('web3.box.cipherPlaceholder')}
          onMessageChange={props.onBoxABMessageChange}
          onCipherTextChange={props.onBoxABCipherTextChange}
          onEncrypt={props.onEncryptBoxAB}
          onDecrypt={props.onDecryptBoxAB}
        />

        <BoxFlowPanel
          title="B → A"
          description={t('web3.box.flowBA.desc')}
          message={props.boxBAMessage}
          cipherText={props.boxBACipherText}
          decryptedText={props.boxBADecryptedText}
          error={props.boxBAError}
          encryptLabel={t('web3.box.flowBA.encrypt')}
          decryptLabel={t('web3.box.flowBA.decrypt')}
          messagePlaceholder={t('web3.box.flowBA.messagePlaceholder')}
          cipherPlaceholder={t('web3.box.cipherPlaceholder')}
          onMessageChange={props.onBoxBAMessageChange}
          onCipherTextChange={props.onBoxBACipherTextChange}
          onEncrypt={props.onEncryptBoxBA}
          onDecrypt={props.onDecryptBoxBA}
        />
      </div>

      <div className="web3-box-flow-grid">
        <section className="web3-box-flow ui-glass-surface">
          <div className="web3-box-flow-header">
            <div>
              <h2>{t('web3.box.encryptTitle')}</h2>
              <p>{t('web3.box.encryptDesc')}</p>
            </div>
          </div>

          <label className="web3-box-result-header">
            <span>{t('web3.box.sender')}</span>
          </label>
          <div className="input-wrap">
            <input
              type={props.boxEncryptShowPrivateKey ? 'text' : 'password'}
              placeholder={t('web3.box.senderPrivatePlaceholder')}
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
            <span>{t('web3.box.recipient')}</span>
          </label>
          <input
            type="text"
            placeholder={t('web3.box.recipientPublicPlaceholder')}
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
            <span>{t('web3.box.plaintext')}</span>
          </label>
          <textarea
            className="textarea"
            value={props.boxEncryptMessage}
            onChange={event =>
              props.onBoxEncryptMessageChange(event.target.value)
            }
            rows={4}
            placeholder={t('web3.box.messagePlaceholder')}
            translate="no"
          />

          <div className="web3-box-actions">
            <button
              className="btn btn-primary"
              onClick={props.onEncryptOnly}
              type="button"
            >
              <Lock size={16} />
              {t('web3.box.encryptTitle')}
            </button>
          </div>

          {props.boxEncryptError && (
            <p className="web3-tools-danger">{props.boxEncryptError}</p>
          )}

          <div className="web3-box-result">
            <label className="web3-box-result-header">
              <span>{t('web3.box.ciphertext')}</span>
            </label>
            <textarea
              className="textarea mono"
              value={props.boxEncryptCipherText}
              readOnly
              rows={5}
              placeholder={t('web3.box.encryptResultPlaceholder')}
              translate="no"
            />
          </div>
        </section>

        <section className="web3-box-flow ui-glass-surface">
          <div className="web3-box-flow-header">
            <div>
              <h2>{t('web3.box.decryptTitle')}</h2>
              <p>{t('web3.box.decryptDesc')}</p>
            </div>
          </div>

          <label className="web3-box-result-header">
            <span>{t('web3.box.sender')}</span>
          </label>
          <input
            type="text"
            placeholder={t('web3.box.senderPublicPlaceholder')}
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
            <span>{t('web3.box.recipient')}</span>
          </label>
          <div className="input-wrap">
            <input
              type={props.boxDecryptShowPrivateKey ? 'text' : 'password'}
              placeholder={t('web3.box.recipientPrivatePlaceholder')}
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
            <span>{t('web3.box.ciphertext')}</span>
          </label>
          <textarea
            className="textarea mono"
            value={props.boxDecryptCipherText}
            onChange={event =>
              props.onBoxDecryptCipherTextChange(event.target.value)
            }
            rows={5}
            placeholder={t('web3.box.cipherDecryptPlaceholder')}
            translate="no"
          />

          <div className="web3-box-actions">
            <button
              className="btn btn-secondary"
              onClick={props.onDecryptOnly}
              type="button"
            >
              <KeyRound size={16} />
              {t('web3.box.decryptTitle')}
            </button>
          </div>

          {props.boxDecryptError && (
            <p className="web3-tools-danger">{props.boxDecryptError}</p>
          )}

          <div className="web3-box-result">
            <label className="web3-box-result-header">
              <span>{t('web3.box.decryptResult')}</span>
            </label>
            <textarea
              className="textarea mono"
              value={props.boxDecryptResult}
              readOnly
              rows={5}
              placeholder={t('web3.box.decryptResultPlaceholder')}
              translate="no"
            />
          </div>
        </section>
      </div>
    </div>
  )
}
