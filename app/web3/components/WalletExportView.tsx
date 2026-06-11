import { ChevronDown, ChevronUp, KeyRound, QrCode, ShieldAlert, Wallet } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { CopyButton } from '~/components/CopyButton'
import { EmptyState } from '~/components/EmptyState'
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
  const effectiveAddress = walletResult?.address || ''

  if (!walletResult || !effectiveAddress) {
    return (
      <EmptyState
        icon={<Wallet size={36} />}
        message="请输入用户名和密码以使用钱包工具"
      />
    )
  }

  return (
    <>
      <div className="web3-tools-section">
        <button className="web3-tools-toggle" onClick={onToggleAddressQr}>
          <QrCode size={14} />
          {showAddressQr ? '隐藏地址二维码' : '显示地址二维码'}
          {showAddressQr ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showAddressQr && (
          <div className="web3-mnemonic-reveal">
            <div className="web3-mnemonic-card">
              <p className="web3-mnemonic-text">{effectiveAddress}</p>
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
          <button className="web3-tools-toggle" onClick={onToggleMnemonicReveal}>
            <KeyRound size={14} />
            {showMnemonicReveal ? '隐藏助记词' : '显示助记词'}
            {showMnemonicReveal ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
          {showMnemonicReveal && (
            <div className="web3-mnemonic-reveal">
              <div className="web3-mnemonic-card">
                <p className="web3-mnemonic-text">{mnemonicPhrase}</p>
                <CopyButton text={mnemonicPhrase} />
              </div>
              <p className="web3-tools-danger">
                <ShieldAlert size={14} />
                任何拥有您助记词的人都可以窃取您账户中的任何资产，切勿泄露！！！
              </p>
              <button className="web3-tools-toggle" onClick={onToggleMnemonicQr}>
                {showMnemonicQr ? '隐藏助记词二维码' : '显示助记词二维码'}
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
              派生 {deriveBatch} 个地址
            </button>
          </div>

          <p className="web3-tools-danger">
            <ShieldAlert size={14} />
            任何拥有您私钥的人都可以窃取您地址中的任何资产，切勿泄露！！！
          </p>

          {deriveList.length > 0 && (
            <div className="web3-derive-table-wrap">
              <table className="web3-derive-table">
                <thead>
                  <tr>
                    <th onClick={onToggleDeriveIndex} className="web3-derive-th">
                      账户
                    </th>
                    <th onClick={onToggleDeriveAddress} className="web3-derive-th">
                      地址
                    </th>
                    <th
                      onClick={onToggleDerivePrivateKey}
                      className="web3-derive-th danger"
                    >
                      私钥（点击{deriveShowPrivateKey ? '隐藏' : '显示'}）
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deriveList.map(item => (
                    <tr key={item.index}>
                      <td>{deriveShowIndex ? item.index + 1 : ''}</td>
                      <td>{deriveShowAddress ? item.address : ''}</td>
                      <td className="danger">
                        {deriveShowPrivateKey ? item.privateKey : ''}
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
