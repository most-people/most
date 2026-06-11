'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { HDNodeWallet } from 'ethers'
import {
  ArrowLeft,
  Database,
  KeyRound,
  Lock,
  Moon,
  Sun,
  Upload,
  User,
  Wallet,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import {
  mostBoxDecrypt,
  mostBoxEncrypt,
  mostWallet,
  mostMnemonic,
  most25519,
} from '~/server/src/utils/mostWallet.js'
import { getEdKeyPair, getIPNS } from '~/server/src/utils/mp.js'
import { generateAvatar } from '~/server/src/utils/avatar.js'
import { AsymmetricBoxView } from './components/AsymmetricBoxView'
import { PemExportView } from './components/PemExportView'
import { UserDataExportSection } from './components/UserDataExportSection'
import { UserDataImportSection } from './components/UserDataImportSection'
import { WalletExportView } from './components/WalletExportView'
import { WalletIdentityView } from './components/WalletIdentityView'
import { Web3LoginPanel } from './components/Web3LoginPanel'
import {
  ed25519PublicKeyToPEM,
  ed25519ToPKCS8PEM,
} from './components/cryptoPem'
import type {
  BoxAccount,
  DerivedWallet,
  MostKeySet,
  ViewId,
  WalletResult,
} from './components/types'

const validViews: readonly ViewId[] = [
  'wallet',
  'pem',
  'export',
  'EA',
  'user-export',
  'user-import',
]

function getHashView(): ViewId {
  const hash = window.location.hash.replace('#', '')
  return validViews.includes(hash as ViewId) ? (hash as ViewId) : 'wallet'
}

export default function Web3Page() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)

  const [currentView, setCurrentView] = useState<ViewId>('wallet')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [walletResult, setWalletResult] = useState<WalletResult | null>(null)
  const [keys, setKeys] = useState<MostKeySet | null>(null)
  const [ipns, setIpns] = useState('')
  const [privatePem, setPrivatePem] = useState('')
  const [publicPem, setPublicPem] = useState('')
  const [mnemonicPhrase, setMnemonicPhrase] = useState('')
  const [deriveList, setDeriveList] = useState<DerivedWallet[]>([])
  const [deriveIndex, setDeriveIndex] = useState(0)
  const [deriveShowIndex, setDeriveShowIndex] = useState(true)
  const [deriveShowAddress, setDeriveShowAddress] = useState(true)
  const [deriveShowPrivateKey, setDeriveShowPrivateKey] = useState(false)
  const [showAddressQr, setShowAddressQr] = useState(false)
  const [showMnemonicReveal, setShowMnemonicReveal] = useState(false)
  const [showMnemonicQr, setShowMnemonicQr] = useState(false)
  const [showX25519Private, setShowX25519Private] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [boxAUsername, setBoxAUsername] = useState('')
  const [boxAPassword, setBoxAPassword] = useState('')
  const [boxAShowPassword, setBoxAShowPassword] = useState(false)
  const [boxAShowPrivateKey, setBoxAShowPrivateKey] = useState(false)
  const [boxAAccount, setBoxAAccount] = useState<BoxAccount | null>(null)
  const [boxBUsername, setBoxBUsername] = useState('')
  const [boxBPassword, setBoxBPassword] = useState('')
  const [boxBShowPassword, setBoxBShowPassword] = useState(false)
  const [boxBShowPrivateKey, setBoxBShowPrivateKey] = useState(false)
  const [boxBAccount, setBoxBAccount] = useState<BoxAccount | null>(null)
  const [boxABMessage, setBoxABMessage] =
    useState('你好，B。这是来自 A 的加密消息。')
  const [boxABCipherText, setBoxABCipherText] = useState('')
  const [boxABDecryptedText, setBoxABDecryptedText] = useState('')
  const [boxABError, setBoxABError] = useState('')
  const [boxBAMessage, setBoxBAMessage] =
    useState('你好，A。这是来自 B 的加密消息。')
  const [boxBACipherText, setBoxBACipherText] = useState('')
  const [boxBADecryptedText, setBoxBADecryptedText] = useState('')
  const [boxBAError, setBoxBAError] = useState('')
  const [boxDecryptSenderPublicKey, setBoxDecryptSenderPublicKey] = useState('')
  const [boxDecryptRecipientPrivateKey, setBoxDecryptRecipientPrivateKey] =
    useState('')
  const [boxDecryptCipherText, setBoxDecryptCipherText] = useState('')
  const [boxDecryptResult, setBoxDecryptResult] = useState('')
  const [boxDecryptError, setBoxDecryptError] = useState('')
  const [boxDecryptShowPrivateKey, setBoxDecryptShowPrivateKey] =
    useState(false)
  const [boxEncryptSenderPrivateKey, setBoxEncryptSenderPrivateKey] =
    useState('')
  const [boxEncryptRecipientPublicKey, setBoxEncryptRecipientPublicKey] =
    useState('')
  const [boxEncryptMessage, setBoxEncryptMessage] = useState('')
  const [boxEncryptCipherText, setBoxEncryptCipherText] = useState('')
  const [boxEncryptError, setBoxEncryptError] = useState('')
  const [boxEncryptShowPrivateKey, setBoxEncryptShowPrivateKey] =
    useState(false)

  useEffect(() => {
    setCurrentView(getHashView())
    const onHashChange = () => setCurrentView(getHashView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const switchView = (id: ViewId) => {
    setCurrentView(id)
    window.location.hash = id
  }

  const handleGenerate = useCallback(async () => {
    if (!username.trim()) return
    setGenerating(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    const result = mostWallet(username.trim(), password)
    const displayName = `${result.username}#${result.address.slice(-4).toUpperCase()}`
    setWalletResult(result)
    setUserIdentity({ ...result, displayName })
    addToast(`已登录 ${result.username}`, 'success')
    setMnemonicPhrase(mostMnemonic(result.danger))
    const nextKeys = most25519(result.danger)
    setKeys(nextKeys)
    setIpns(getIPNS(nextKeys.private_key, nextKeys.ed_public_key))
    const pair = getEdKeyPair(nextKeys.private_key, nextKeys.ed_public_key)
    setPrivatePem(ed25519ToPKCS8PEM(pair.secretKey))
    setPublicPem(ed25519PublicKeyToPEM(pair.publicKey))
    setDeriveList([])
    setDeriveIndex(0)
    setShowAddressQr(false)
    setShowMnemonicReveal(false)
    setShowMnemonicQr(false)
    setShowX25519Private(false)
    setGenerating(false)
  }, [addToast, password, setUserIdentity, username])

  function generateBoxAccount(
    nextUsername: string,
    nextPassword: string,
    setter: (account: BoxAccount) => void
  ) {
    const trimmedUsername = nextUsername.trim()
    if (!trimmedUsername) return
    const wallet = mostWallet(trimmedUsername, nextPassword)
    const nextKeys = most25519(wallet.danger)
    setter({
      username: wallet.username,
      address: wallet.address,
      publicKey: nextKeys.public_key,
      privateKey: nextKeys.private_key,
    })
    setBoxABDecryptedText('')
    setBoxABError('')
    setBoxBADecryptedText('')
    setBoxBAError('')
    addToast('账号已生成', 'success')
  }

  function encryptBoxMessage({
    senderAccount,
    recipientAccount,
    message,
    setCipherText,
    setDecryptedText,
    setError,
  }: {
    senderAccount: BoxAccount | null
    recipientAccount: BoxAccount | null
    message: string
    setCipherText: (value: string) => void
    setDecryptedText: (value: string) => void
    setError: (value: string) => void
  }) {
    if (!senderAccount || !recipientAccount) {
      setError('请先生成 A 和 B 两个账号')
      return
    }
    if (!message.trim()) {
      setError('请输入要加密的消息')
      return
    }
    const encrypted = mostBoxEncrypt(message, {
      senderPrivateKey: senderAccount.privateKey,
      recipientPublicKey: recipientAccount.publicKey,
    })
    setCipherText(encrypted)
    setDecryptedText('')
    setError('')
  }

  function decryptBoxMessage({
    senderAccount,
    recipientAccount,
    cipherText,
    setDecryptedText,
    setError,
  }: {
    senderAccount: BoxAccount | null
    recipientAccount: BoxAccount | null
    cipherText: string
    setDecryptedText: (value: string) => void
    setError: (value: string) => void
  }) {
    if (!senderAccount || !recipientAccount) {
      setError('请先生成 A 和 B 两个账号')
      return
    }
    if (!cipherText.trim()) {
      setError('请先生成或粘贴密文')
      return
    }
    const decrypted = mostBoxDecrypt(cipherText, {
      senderPublicKey: senderAccount.publicKey,
      recipientPrivateKey: recipientAccount.privateKey,
    })
    if (!decrypted) {
      setError('解密失败，请确认发送方公钥、接收方私钥和密文匹配')
      setDecryptedText('')
      return
    }
    setDecryptedText(decrypted)
    setError('')
  }

  function handleDecryptOnly() {
    if (!boxDecryptSenderPublicKey.trim()) {
      setBoxDecryptError('请输入发送方公钥')
      return
    }
    if (!boxDecryptRecipientPrivateKey.trim()) {
      setBoxDecryptError('请输入接收方私钥')
      return
    }
    if (!boxDecryptCipherText.trim()) {
      setBoxDecryptError('请粘贴密文')
      return
    }
    const decrypted = mostBoxDecrypt(boxDecryptCipherText, {
      senderPublicKey: boxDecryptSenderPublicKey.trim(),
      recipientPrivateKey: boxDecryptRecipientPrivateKey.trim(),
    })
    if (!decrypted) {
      setBoxDecryptError('解密失败，请确认发送方公钥、接收方私钥和密文匹配')
      setBoxDecryptResult('')
      return
    }
    setBoxDecryptResult(decrypted)
    setBoxDecryptError('')
  }

  function handleEncryptOnly() {
    if (!boxEncryptSenderPrivateKey.trim()) {
      setBoxEncryptError('请输入发送方私钥')
      return
    }
    if (!boxEncryptRecipientPublicKey.trim()) {
      setBoxEncryptError('请输入接收方公钥')
      return
    }
    if (!boxEncryptMessage.trim()) {
      setBoxEncryptError('请输入要加密的消息')
      return
    }
    const encrypted = mostBoxEncrypt(boxEncryptMessage, {
      senderPrivateKey: boxEncryptSenderPrivateKey.trim(),
      recipientPublicKey: boxEncryptRecipientPublicKey.trim(),
    })
    setBoxEncryptCipherText(encrypted)
    setBoxEncryptError('')
  }

  const deriveBatch = 10
  const handleDerive = () => {
    if (!mnemonicPhrase) return
    const list: DerivedWallet[] = []
    for (let i = deriveIndex; i < deriveIndex + deriveBatch; i++) {
      const path = `m/44'/60'/0'/0/${i}`
      const wallet = HDNodeWallet.fromPhrase(mnemonicPhrase, undefined, path)
      list.push({
        index: i,
        address: wallet.address,
        privateKey: wallet.privateKey,
      })
    }
    setDeriveList(prev => [...prev, ...list])
    setDeriveIndex(prev => prev + deriveBatch)
  }

  const avatarSrc = generateAvatar(walletResult?.address || undefined)
  const viewTitle =
    currentView === 'wallet'
      ? 'Web3'
      : currentView === 'pem'
        ? 'PEM 导出'
        : currentView === 'EA'
          ? '非对称加密'
          : currentView === 'user-export'
            ? '用户数据导出'
            : currentView === 'user-import'
              ? '用户数据导入'
              : 'Wallet 导出'

  const sidebarNavItems: Array<{
    id: ViewId
    icon: ReactNode
    label: string
  }> = [
    { id: 'wallet', icon: <User size={16} />, label: 'Web3' },
    { id: 'pem', icon: <Lock size={16} />, label: 'PEM 导出' },
    { id: 'export', icon: <Wallet size={16} />, label: 'Wallet 导出' },
    { id: 'EA', icon: <KeyRound size={16} />, label: '非对称加密' },
    { id: 'user-export', icon: <Database size={16} />, label: '数据导出' },
    { id: 'user-import', icon: <Upload size={16} />, label: '数据导入' },
  ]

  const showLoginPanel = currentView !== 'EA' && !currentView.startsWith('user-')

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <>
          <div
            className="sidebar-header sidebar-header-link"
            onClick={() => (window.location.href = '/')}
          >
            <ArrowLeft size={18} />
            <h1>MOST PEOPLE</h1>
          </div>
          <nav className="sidebar-nav">
            {sidebarNavItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  switchView(item.id)
                  closeSidebar()
                }}
                className={`sidebar-nav-btn ${currentView === item.id ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      headerTitle={<h2 className="header-title">{viewTitle}</h2>}
      headerRight={
        <button
          className="btn btn-icon"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="切换主题"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      }
    >
      <div className="web3-page">
        <div className={`web3-container ${currentView === 'EA' ? 'wide' : ''}`}>
          {showLoginPanel && (
            <Web3LoginPanel
              username={username}
              password={password}
              showPassword={showPassword}
              generating={generating}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              onGenerate={handleGenerate}
            />
          )}

          {currentView === 'wallet' && (
            <WalletIdentityView
              walletResult={walletResult}
              keys={keys}
              ipns={ipns}
              avatarSrc={avatarSrc}
              showPrivateKey={showX25519Private}
              onTogglePrivateKey={() =>
                setShowX25519Private(!showX25519Private)
              }
            />
          )}

          {currentView === 'pem' && (
            <PemExportView
              walletResult={walletResult}
              publicPem={publicPem}
              privatePem={privatePem}
            />
          )}

          {currentView === 'export' && (
            <WalletExportView
              walletResult={walletResult}
              mnemonicPhrase={mnemonicPhrase}
              deriveBatch={deriveBatch}
              deriveList={deriveList}
              deriveShowIndex={deriveShowIndex}
              deriveShowAddress={deriveShowAddress}
              deriveShowPrivateKey={deriveShowPrivateKey}
              showAddressQr={showAddressQr}
              showMnemonicReveal={showMnemonicReveal}
              showMnemonicQr={showMnemonicQr}
              onToggleAddressQr={() => setShowAddressQr(!showAddressQr)}
              onToggleMnemonicReveal={() =>
                setShowMnemonicReveal(!showMnemonicReveal)
              }
              onToggleMnemonicQr={() => setShowMnemonicQr(!showMnemonicQr)}
              onToggleDeriveIndex={() =>
                setDeriveShowIndex(!deriveShowIndex)
              }
              onToggleDeriveAddress={() =>
                setDeriveShowAddress(!deriveShowAddress)
              }
              onToggleDerivePrivateKey={() =>
                setDeriveShowPrivateKey(!deriveShowPrivateKey)
              }
              onDerive={handleDerive}
            />
          )}

          {currentView === 'EA' && (
            <AsymmetricBoxView
              boxAUsername={boxAUsername}
              boxAPassword={boxAPassword}
              boxAShowPassword={boxAShowPassword}
              boxAShowPrivateKey={boxAShowPrivateKey}
              boxAAccount={boxAAccount}
              boxBUsername={boxBUsername}
              boxBPassword={boxBPassword}
              boxBShowPassword={boxBShowPassword}
              boxBShowPrivateKey={boxBShowPrivateKey}
              boxBAccount={boxBAccount}
              boxABMessage={boxABMessage}
              boxABCipherText={boxABCipherText}
              boxABDecryptedText={boxABDecryptedText}
              boxABError={boxABError}
              boxBAMessage={boxBAMessage}
              boxBACipherText={boxBACipherText}
              boxBADecryptedText={boxBADecryptedText}
              boxBAError={boxBAError}
              boxEncryptSenderPrivateKey={boxEncryptSenderPrivateKey}
              boxEncryptRecipientPublicKey={boxEncryptRecipientPublicKey}
              boxEncryptMessage={boxEncryptMessage}
              boxEncryptCipherText={boxEncryptCipherText}
              boxEncryptError={boxEncryptError}
              boxEncryptShowPrivateKey={boxEncryptShowPrivateKey}
              boxDecryptSenderPublicKey={boxDecryptSenderPublicKey}
              boxDecryptRecipientPrivateKey={boxDecryptRecipientPrivateKey}
              boxDecryptCipherText={boxDecryptCipherText}
              boxDecryptResult={boxDecryptResult}
              boxDecryptError={boxDecryptError}
              boxDecryptShowPrivateKey={boxDecryptShowPrivateKey}
              onBoxAUsernameChange={setBoxAUsername}
              onBoxAPasswordChange={setBoxAPassword}
              onBoxAShowPasswordToggle={() =>
                setBoxAShowPassword(!boxAShowPassword)
              }
              onBoxAShowPrivateKeyToggle={() =>
                setBoxAShowPrivateKey(!boxAShowPrivateKey)
              }
              onGenerateBoxA={() =>
                generateBoxAccount(boxAUsername, boxAPassword, setBoxAAccount)
              }
              onBoxBUsernameChange={setBoxBUsername}
              onBoxBPasswordChange={setBoxBPassword}
              onBoxBShowPasswordToggle={() =>
                setBoxBShowPassword(!boxBShowPassword)
              }
              onBoxBShowPrivateKeyToggle={() =>
                setBoxBShowPrivateKey(!boxBShowPrivateKey)
              }
              onGenerateBoxB={() =>
                generateBoxAccount(boxBUsername, boxBPassword, setBoxBAccount)
              }
              onBoxABMessageChange={setBoxABMessage}
              onBoxABCipherTextChange={setBoxABCipherText}
              onEncryptBoxAB={() =>
                encryptBoxMessage({
                  senderAccount: boxAAccount,
                  recipientAccount: boxBAccount,
                  message: boxABMessage,
                  setCipherText: setBoxABCipherText,
                  setDecryptedText: setBoxABDecryptedText,
                  setError: setBoxABError,
                })
              }
              onDecryptBoxAB={() =>
                decryptBoxMessage({
                  senderAccount: boxAAccount,
                  recipientAccount: boxBAccount,
                  cipherText: boxABCipherText,
                  setDecryptedText: setBoxABDecryptedText,
                  setError: setBoxABError,
                })
              }
              onBoxBAMessageChange={setBoxBAMessage}
              onBoxBACipherTextChange={setBoxBACipherText}
              onEncryptBoxBA={() =>
                encryptBoxMessage({
                  senderAccount: boxBAccount,
                  recipientAccount: boxAAccount,
                  message: boxBAMessage,
                  setCipherText: setBoxBACipherText,
                  setDecryptedText: setBoxBADecryptedText,
                  setError: setBoxBAError,
                })
              }
              onDecryptBoxBA={() =>
                decryptBoxMessage({
                  senderAccount: boxBAccount,
                  recipientAccount: boxAAccount,
                  cipherText: boxBACipherText,
                  setDecryptedText: setBoxBADecryptedText,
                  setError: setBoxBAError,
                })
              }
              onBoxEncryptSenderPrivateKeyChange={
                setBoxEncryptSenderPrivateKey
              }
              onBoxEncryptRecipientPublicKeyChange={
                setBoxEncryptRecipientPublicKey
              }
              onBoxEncryptMessageChange={setBoxEncryptMessage}
              onBoxEncryptShowPrivateKeyToggle={() =>
                setBoxEncryptShowPrivateKey(!boxEncryptShowPrivateKey)
              }
              onEncryptOnly={handleEncryptOnly}
              onBoxDecryptSenderPublicKeyChange={setBoxDecryptSenderPublicKey}
              onBoxDecryptRecipientPrivateKeyChange={
                setBoxDecryptRecipientPrivateKey
              }
              onBoxDecryptCipherTextChange={setBoxDecryptCipherText}
              onBoxDecryptShowPrivateKeyToggle={() =>
                setBoxDecryptShowPrivateKey(!boxDecryptShowPrivateKey)
              }
              onDecryptOnly={handleDecryptOnly}
            />
          )}

          {currentView === 'user-export' && <UserDataExportSection />}
          {currentView === 'user-import' && <UserDataImportSection />}
        </div>
      </div>
    </AppShell>
  )
}
