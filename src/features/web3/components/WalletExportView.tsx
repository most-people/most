import {
  ChevronDown,
  ChevronUp,
  KeyRound,
  QrCode,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { CopyButton } from '~/components/CopyButton'
import { EmptyState } from '~/components/EmptyState'
import { useI18n } from '~/lib/i18n'
import type { DerivedWallet, WalletResult } from './types'

type WalletExportViewProps = {
  walletResult: WalletResult | null
  mnemonicPhrase: string
  deriveBatch: number
  deriveList: DerivedWallet[]
  deriveShowIndex: boolean
  deriveShowAddress: boolean
  deriveShowPrivateKey: boolean
  showAddressQr: boolean
  showMnemonicReveal: boolean
  showMnemonicQr: boolean
  onToggleAddressQr: () => void
  onToggleMnemonicReveal: () => void
  onToggleMnemonicQr: () => void
  onToggleDeriveIndex: () => void
  onToggleDeriveAddress: () => void
  onToggleDerivePrivateKey: () => void
  onDerive: () => void
}

export function WalletExportView({
  walletResult,
  mnemonicPhrase,
  deriveBatch,
  deriveList,
  deriveShowIndex,
  deriveShowAddress,
  deriveShowPrivateKey,
  showAddressQr,
  showMnemonicReveal,
  showMnemonicQr,
  onToggleAddressQr,
  onToggleMnemonicReveal,
  onToggleMnemonicQr,
  onToggleDeriveIndex,
  onToggleDeriveAddress,
  onToggleDerivePrivateKey,
  onDerive,
}: WalletExportViewProps) {
  const { t } = useI18n()
  const effectiveAddress = walletResult?.address || ''

  if (!walletResult || !effectiveAddress) {
    return (
      <EmptyState
        icon={<Wallet size={36} />}
        message={t('web3.empty.walletTools')}
      />
    )
  }

  return (
    <>
      <div className="web3-tools-section">
        <button className="web3-tools-toggle" onClick={onToggleAddressQr}>
          <QrCode size={14} />
          {showAddressQr
            ? t('web3.action.hideAddressQr')
            : t('web3.action.showAddressQr')}
          {showAddressQr ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showAddressQr && (
          <div className="web3-mnemonic-reveal">
            <div className="web3-mnemonic-card">
              <p className="web3-mnemonic-text" translate="no">
                {effectiveAddress}
              </p>
              <CopyButton text={effectiveAddress} />
            </div>
            <div className="qr-wrap">
              <QRCodeSVG value={effectiveAddress} size={200} />
            </div>
          </div>
        )}
      </div>

      {mnemonicPhrase && (
        <div className="web3-tools-section">
          <button
            className="web3-tools-toggle"
            onClick={onToggleMnemonicReveal}
          >
            <KeyRound size={14} />
            {showMnemonicReveal
              ? t('web3.action.hideMnemonic')
              : t('web3.action.showMnemonic')}
            {showMnemonicReveal ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
          {showMnemonicReveal && (
            <div className="web3-mnemonic-reveal">
              <div className="web3-mnemonic-card">
                <p className="web3-mnemonic-text" translate="no">
                  {mnemonicPhrase}
                </p>
                <CopyButton text={mnemonicPhrase} />
              </div>
              <p className="web3-tools-danger">
                <ShieldAlert size={14} />
                {t('web3.warning.mnemonic')}
              </p>
              <button
                className="web3-tools-toggle"
                onClick={onToggleMnemonicQr}
              >
                {showMnemonicQr
                  ? t('web3.action.hideMnemonicQr')
                  : t('web3.action.showMnemonicQr')}
              </button>
              {showMnemonicQr && (
                <div className="qr-wrap">
                  <QRCodeSVG value={mnemonicPhrase} size={260} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mnemonicPhrase && (
        <div className="web3-mnemonic-reveal">
          <div>
            <button className="btn btn-primary" onClick={onDerive}>
              {t('web3.action.deriveAddresses', { count: deriveBatch })}
            </button>
          </div>

          <p className="web3-tools-danger">
            <ShieldAlert size={14} />
            {t('web3.warning.privateKey')}
          </p>

          {deriveList.length > 0 && (
            <div className="web3-derive-table-wrap">
              <table className="web3-derive-table">
                <thead>
                  <tr>
                    <th
                      onClick={onToggleDeriveIndex}
                      className="web3-derive-th"
                    >
                      {t('web3.label.account')}
                    </th>
                    <th
                      onClick={onToggleDeriveAddress}
                      className="web3-derive-th"
                    >
                      {t('web3.label.address')}
                    </th>
                    <th
                      onClick={onToggleDerivePrivateKey}
                      className="web3-derive-th danger"
                    >
                      {t('web3.label.privateKeyToggle', {
                        action: deriveShowPrivateKey
                          ? t('web3.action.hide')
                          : t('web3.action.show'),
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deriveList.map(item => (
                    <tr key={item.index}>
                      <td>{deriveShowIndex ? item.index + 1 : ''}</td>
                      <td translate="no">
                        {deriveShowAddress ? item.address : ''}
                      </td>
                      <td className="danger">
                        <span translate="no">
                          {deriveShowPrivateKey ? item.privateKey : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
