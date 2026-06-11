'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { HDNodeWallet } from 'ethers'
import {
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Fingerprint,
  Shield,
  Globe,
  Sun,
  Moon,
  QrCode,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  User,
  Lock,
  Wallet,
  ArrowLeft,
  Database,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import AppShell from '~/components/AppShell'
import { CopyButton } from '~/components/CopyButton'
import { EmptyState } from '~/components/EmptyState'
import { KeyCard } from '~/components/KeyCard'
import { PemBlock } from '~/components/PemBlock'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import {
  mostBoxDecrypt,
  mostBoxEncrypt,
  mostWallet,
  mostMnemonic,
  most25519,
  parseMostBoxToken,
} from '~/server/src/utils/mostWallet.js'
import { getEdKeyPair, getIPNS } from '~/server/src/utils/mp.js'
import { generateAvatar } from '~/server/src/utils/avatar.js'

type BoxAccount = {
  username: string
  address: string
  publicKey: string
  privateKey: string
}

interface BoxAccountPanelProps {
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

interface BoxFlowPanelProps {
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

function maskSecret(value: string) {
  return value ? '•'.repeat(Math.min(value.length, 32)) : '-'
}

function formatBoxTimestamp(timestampMs: number) {
  if (!Number.isFinite(timestampMs)) return '-'
  return `${new Date(timestampMs).toLocaleString()}`
}

function BoxAccountPanel({
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
          <button
            className="input-eye"
            onClick={onTogglePassword}
            type="button"
          >
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

function BoxFlowPanel({
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

const base64Encode = bytes => btoa(String.fromCharCode(...bytes))

const ed25519ToPKCS8PEM = privateKey => {
  const ed25519AlgorithmIdentifier = new Uint8Array([
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  ])
  const privateKeyOctetString = new Uint8Array([
    0x04,
    0x22,
    0x04,
    0x20,
    ...privateKey.slice(0, 32),
  ])
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const totalLength =
    version.length +
    ed25519AlgorithmIdentifier.length +
    privateKeyOctetString.length
  const pkcs8 = new Uint8Array(2 + totalLength)
  pkcs8[0] = 0x30
  pkcs8[1] = totalLength
  let offset = 2
  pkcs8.set(version, offset)
  offset += version.length
  pkcs8.set(ed25519AlgorithmIdentifier, offset)
  offset += ed25519AlgorithmIdentifier.length
  pkcs8.set(privateKeyOctetString, offset)
  const base64 = base64Encode(pkcs8)
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`
}

const ed25519PublicKeyToPEM = publicKey => {
  const ed25519AlgorithmIdentifier = new Uint8Array([
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  ])
  const publicKeyBitString = new Uint8Array([0x03, 0x21, 0x00, ...publicKey])
  const totalLength =
    ed25519AlgorithmIdentifier.length + publicKeyBitString.length
  const spki = new Uint8Array(2 + totalLength)
  spki[0] = 0x30
  spki[1] = totalLength
  let offset = 2
  spki.set(ed25519AlgorithmIdentifier, offset)
  offset += ed25519AlgorithmIdentifier.length
  spki.set(publicKeyBitString, offset)
  const base64 = base64Encode(spki)
  return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`
}

/* ─── Main Page ─── */

export default function Web3Page() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)

  /* view */
  const validViews = ['wallet', 'pem', 'export', 'EA'] as const
  type ViewId = (typeof validViews)[number]
  const [currentView, setCurrentView] = useState<ViewId>('wallet')

  useEffect(() => {
    const hashToView = (): ViewId => {
      const hash = window.location.hash.replace('#', '')
      return validViews.includes(hash as ViewId) ? (hash as ViewId) : 'wallet'
    }
    setCurrentView(hashToView())
    const onHashChange = () => setCurrentView(hashToView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const switchView = (id: ViewId) => {
    setCurrentView(id)
    window.location.hash = id
  }

  /* username+password inputs */
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  /* results */
  const [walletResult, setWalletResult] = useState<any>(null)
  const [keys, setKeys] = useState<any>(null)
  const [ipns, setIpns] = useState('')
  const [privatePem, setPrivatePem] = useState('')
  const [publicPem, setPublicPem] = useState('')
  const [mnemonicPhrase, setMnemonicPhrase] = useState('')

  /* derive */
  const [deriveList, setDeriveList] = useState<any[]>([])
  const [deriveIndex, setDeriveIndex] = useState(0)
  const [deriveShowIndex, setDeriveShowIndex] = useState(true)
  const [deriveShowAddress, setDeriveShowAddress] = useState(true)
  const [deriveShowPrivateKey, setDeriveShowPrivateKey] = useState(false)

  /* toggles */
  const [showAddressQr, setShowAddressQr] = useState(false)
  const [showMnemonicReveal, setShowMnemonicReveal] = useState(false)
  const [showMnemonicQr, setShowMnemonicQr] = useState(false)
  const [showX25519Private, setShowX25519Private] = useState(false)

  /* generate state */
  const [generating, setGenerating] = useState(false)

  /* asymmetric box demo */
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

  /* compute results on button click */
  const handleGenerate = useCallback(async () => {
    if (!username.trim()) return
    setGenerating(true)
    // Yield to the event loop so the loading state renders before blocking
    await new Promise(r => setTimeout(r, 0))
    const result = mostWallet(username.trim(), password)
    const displayName = `${result.username}#${result.address.slice(-4).toUpperCase()}`
    setWalletResult(result)
    setUserIdentity({
      ...result,
      displayName,
    })
    addToast(`已登录 ${result.username}`, 'success')
    setMnemonicPhrase(mostMnemonic(result.danger))
    const k = most25519(result.danger)
    setKeys(k)
    setIpns(getIPNS(k.private_key, k.ed_public_key))
    const pair = getEdKeyPair(k.private_key, k.ed_public_key)
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
    label: string,
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
    addToast(`账号已生成`, 'success')
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
    const list: any[] = []
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

  const hasValidWallet = !!walletResult
  const effectiveAddress = walletResult?.address || ''
  const avatarSrc = generateAvatar(effectiveAddress || undefined)
  const mask = (s: string) => (s ? '•'.repeat(Math.min(s.length, 32)) : '-')

  const viewTitle =
    currentView === 'wallet'
      ? 'Web3'
      : currentView === 'pem'
        ? 'PEM 导出'
        : currentView === 'EA'
          ? '非对称加密'
          : 'Wallet 导出'

  const sidebarNavItems = [
    {
      id: 'wallet',
      icon: <User size={16} />,
      label: 'Web3',
    },
    { id: 'pem', icon: <Lock size={16} />, label: 'PEM 导出' },
    { id: 'export', icon: <Wallet size={16} />, label: 'Wallet 导出' },
    { id: 'EA', icon: <KeyRound size={16} />, label: '非对称加密' },
  ]

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
                  switchView(item.id as ViewId)
                  closeSidebar()
                }}
                className={`sidebar-nav-btn ${currentView === item.id ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <Link href="/web3/export" className="sidebar-nav-btn">
              <Database size={16} />
              <span>数据导出</span>
            </Link>
            <Link href="/web3/import" className="sidebar-nav-btn">
              <Upload size={16} />
              <span>数据导入</span>
            </Link>
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
          {/* ── Shared Input Area ── */}
          {currentView !== 'EA' && (
            <div className="input-panel">
              <div className="web3-tools-inputs">
                <input
                  type="text"
                  placeholder="用户名"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
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
                    onChange={e => setPassword(e.target.value)}
                    className="input"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                  <button
                    className="input-eye"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={handleGenerate}
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
          )}

          {/* ── View: Identity & Keys ── */}
          {currentView === 'wallet' && (
            <>
              {hasValidWallet && effectiveAddress ? (
                <>
                  <div className="web3-identity-card">
                    <img
                      src={avatarSrc}
                      alt="avatar"
                      className="web3-identity-avatar"
                    />
                    <div>
                      <h1 className="web3-identity-name">
                        {walletResult?.username || '未登录'}
                      </h1>
                      <div className="web3-identity-address">
                        <code>{effectiveAddress.toLowerCase()}</code>
                        <CopyButton text={effectiveAddress.toLowerCase()} />
                        <a
                          href={`https://debank.com/profile/${effectiveAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link"
                        >
                          <ExternalLink size={14} />
                          查看
                        </a>
                      </div>
                    </div>
                  </div>

                  {keys && (
                    <div className="web3-key-grid">
                      <KeyCard
                        title="Ed25519 公钥"
                        icon={<Fingerprint size={18} />}
                      >
                        <div className="mono-row">
                          <code className="mono">{keys.ed_public_key}</code>
                          <CopyButton text={keys.ed_public_key} />
                        </div>
                      </KeyCard>

                      <KeyCard
                        title="x25519 公钥"
                        icon={<KeyRound size={18} />}
                      >
                        <div className="mono-row">
                          <code className="mono">{keys.public_key}</code>
                          <CopyButton text={keys.public_key} />
                        </div>
                      </KeyCard>

                      <KeyCard
                        title="x25519 & Ed25519 私钥"
                        icon={<Shield size={18} />}
                        accent
                      >
                        <div className="mono-row danger">
                          <code className="mono">
                            {showX25519Private
                              ? keys.private_key
                              : mask(keys.private_key)}
                          </code>
                          <button
                            className="btn btn-icon"
                            onClick={() =>
                              setShowX25519Private(!showX25519Private)
                            }
                            title={showX25519Private ? '隐藏私钥' : '显示私钥'}
                            type="button"
                          >
                            {showX25519Private ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </button>
                        </div>
                      </KeyCard>

                      <KeyCard title="IPNS ID" icon={<Globe size={18} />}>
                        <div className="mono-row">
                          <code className="mono">{ipns}</code>
                          <CopyButton text={ipns} />
                        </div>
                      </KeyCard>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<User size={36} />}
                  message="请输入用户名和密码以查看身份信息"
                />
              )}
            </>
          )}

          {/* ── View: PEM Export ── */}
          {currentView === 'pem' && (
            <>
              {publicPem && privatePem ? (
                <div className="web3-pem-list">
                  <PemBlock
                    label={`${walletResult?.username || 'wallet'}.pub`}
                    pem={publicPem}
                    filename={`${walletResult?.username || 'wallet'}.pub`}
                  />
                  <PemBlock
                    label={`${walletResult?.username || 'wallet'}.pem`}
                    pem={privatePem}
                    filename={`${walletResult?.username || 'wallet'}.pem`}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={<Lock size={36} />}
                  message="请输入用户名和密码以生成 PEM 密钥"
                />
              )}
            </>
          )}

          {/* ── View: Wallet Tools ── */}
          {currentView === 'export' && (
            <>
              {hasValidWallet && effectiveAddress ? (
                <>
                  {/* Address QR */}
                  <div className="web3-tools-section">
                    <button
                      className="web3-tools-toggle"
                      onClick={() => setShowAddressQr(!showAddressQr)}
                    >
                      <QrCode size={14} />
                      {showAddressQr ? '隐藏地址二维码' : '显示地址二维码'}
                      {showAddressQr ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                    {showAddressQr && (
                      <div className="web3-mnemonic-reveal">
                        <div className="web3-mnemonic-card">
                          <p className="web3-mnemonic-text">
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

                  {/* Mnemonic */}
                  {mnemonicPhrase && (
                    <div className="web3-tools-section">
                      <button
                        className="web3-tools-toggle"
                        onClick={() =>
                          setShowMnemonicReveal(!showMnemonicReveal)
                        }
                      >
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
                            <p className="web3-mnemonic-text">
                              {mnemonicPhrase}
                            </p>
                            <CopyButton text={mnemonicPhrase} />
                          </div>
                          <p className="web3-tools-danger">
                            <ShieldAlert size={14} />
                            任何拥有您助记词的人都可以窃取您账户中的任何资产，切勿泄露！！！
                          </p>
                          <button
                            className="web3-tools-toggle"
                            onClick={() => setShowMnemonicQr(!showMnemonicQr)}
                          >
                            {showMnemonicQr
                              ? '隐藏助记词二维码'
                              : '显示助记词二维码'}
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

                  {/* Derive Addresses */}
                  {mnemonicPhrase && (
                    <div className="web3-mnemonic-reveal">
                      <div>
                        <button
                          className="btn btn-primary"
                          onClick={handleDerive}
                        >
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
                                <th
                                  onClick={() =>
                                    setDeriveShowIndex(!deriveShowIndex)
                                  }
                                  className="web3-derive-th"
                                >
                                  账户
                                </th>
                                <th
                                  onClick={() =>
                                    setDeriveShowAddress(!deriveShowAddress)
                                  }
                                  className="web3-derive-th"
                                >
                                  地址
                                </th>
                                <th
                                  onClick={() =>
                                    setDeriveShowPrivateKey(
                                      !deriveShowPrivateKey
                                    )
                                  }
                                  className="web3-derive-th danger"
                                >
                                  私钥（点击
                                  {deriveShowPrivateKey ? '隐藏' : '显示'}）
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {deriveList.map(item => (
                                <tr key={item.index}>
                                  <td>
                                    {deriveShowIndex ? item.index + 1 : ''}
                                  </td>
                                  <td>
                                    {deriveShowAddress ? item.address : ''}
                                  </td>
                                  <td className="danger">
                                    {deriveShowPrivateKey
                                      ? item.privateKey
                                      : ''}
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
              ) : (
                <EmptyState
                  icon={<Wallet size={36} />}
                  message="请输入用户名和密码以使用钱包工具"
                />
              )}
            </>
          )}

          {/* ── View: Asymmetric Box ── */}
          {currentView === 'EA' && (
            <div className="web3-box-workspace">
              <div className="web3-box-grid">
                <BoxAccountPanel
                  title="A 账号"
                  username={boxAUsername}
                  password={boxAPassword}
                  showPassword={boxAShowPassword}
                  showPrivateKey={boxAShowPrivateKey}
                  account={boxAAccount}
                  onUsernameChange={setBoxAUsername}
                  onPasswordChange={setBoxAPassword}
                  onTogglePassword={() =>
                    setBoxAShowPassword(!boxAShowPassword)
                  }
                  onTogglePrivateKey={() =>
                    setBoxAShowPrivateKey(!boxAShowPrivateKey)
                  }
                  onGenerate={() =>
                    generateBoxAccount(
                      'A',
                      boxAUsername,
                      boxAPassword,
                      setBoxAAccount
                    )
                  }
                />
                <BoxAccountPanel
                  title="B 账号"
                  username={boxBUsername}
                  password={boxBPassword}
                  showPassword={boxBShowPassword}
                  showPrivateKey={boxBShowPrivateKey}
                  account={boxBAccount}
                  onUsernameChange={setBoxBUsername}
                  onPasswordChange={setBoxBPassword}
                  onTogglePassword={() =>
                    setBoxBShowPassword(!boxBShowPassword)
                  }
                  onTogglePrivateKey={() =>
                    setBoxBShowPrivateKey(!boxBShowPrivateKey)
                  }
                  onGenerate={() =>
                    generateBoxAccount(
                      'B',
                      boxBUsername,
                      boxBPassword,
                      setBoxBAccount
                    )
                  }
                />
              </div>

              <div className="web3-box-flow-grid">
                <BoxFlowPanel
                  title="A → B"
                  description="加密使用 A 私钥 + B 公钥；解密使用 A 公钥 + B 私钥。"
                  message={boxABMessage}
                  cipherText={boxABCipherText}
                  decryptedText={boxABDecryptedText}
                  error={boxABError}
                  encryptLabel="用 A 私钥 + B 公钥加密"
                  decryptLabel="用 A 公钥 + B 私钥解密"
                  messagePlaceholder="输入要从 A 发给 B 的消息"
                  cipherPlaceholder="加密后生成密文，或粘贴已有密文"
                  onMessageChange={setBoxABMessage}
                  onCipherTextChange={setBoxABCipherText}
                  onEncrypt={() =>
                    encryptBoxMessage({
                      senderAccount: boxAAccount,
                      recipientAccount: boxBAccount,
                      message: boxABMessage,
                      setCipherText: setBoxABCipherText,
                      setDecryptedText: setBoxABDecryptedText,
                      setError: setBoxABError,
                    })
                  }
                  onDecrypt={() =>
                    decryptBoxMessage({
                      senderAccount: boxAAccount,
                      recipientAccount: boxBAccount,
                      cipherText: boxABCipherText,
                      setDecryptedText: setBoxABDecryptedText,
                      setError: setBoxABError,
                    })
                  }
                />

                <BoxFlowPanel
                  title="B → A"
                  description="加密使用 B 私钥 + A 公钥；解密使用 B 公钥 + A 私钥。"
                  message={boxBAMessage}
                  cipherText={boxBACipherText}
                  decryptedText={boxBADecryptedText}
                  error={boxBAError}
                  encryptLabel="用 B 私钥 + A 公钥加密"
                  decryptLabel="用 B 公钥 + A 私钥解密"
                  messagePlaceholder="输入要从 B 发给 A 的消息"
                  cipherPlaceholder="加密后生成密文，或粘贴已有密文"
                  onMessageChange={setBoxBAMessage}
                  onCipherTextChange={setBoxBACipherText}
                  onEncrypt={() =>
                    encryptBoxMessage({
                      senderAccount: boxBAccount,
                      recipientAccount: boxAAccount,
                      message: boxBAMessage,
                      setCipherText: setBoxBACipherText,
                      setDecryptedText: setBoxBADecryptedText,
                      setError: setBoxBAError,
                    })
                  }
                  onDecrypt={() =>
                    decryptBoxMessage({
                      senderAccount: boxBAccount,
                      recipientAccount: boxAAccount,
                      cipherText: boxBACipherText,
                      setDecryptedText: setBoxBADecryptedText,
                      setError: setBoxBAError,
                    })
                  }
                />
              </div>

              <div className="web3-box-flow-grid">
                <section className="web3-box-flow">
                  <div className="web3-box-flow-header">
                    <div>
                      <h2>加密</h2>
                      <p>
                        只输入发送方私钥和接收方公钥即可加密，无需生成完整账号。
                      </p>
                    </div>
                  </div>

                  <label className="web3-box-result-header">
                    <span>发送方</span>
                  </label>
                  <div className="input-wrap">
                    <input
                      type={boxEncryptShowPrivateKey ? 'text' : 'password'}
                      placeholder="发送方 x25519 私钥"
                      value={boxEncryptSenderPrivateKey}
                      onChange={event =>
                        setBoxEncryptSenderPrivateKey(event.target.value)
                      }
                      className="input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <button
                      className="input-eye"
                      onClick={() =>
                        setBoxEncryptShowPrivateKey(!boxEncryptShowPrivateKey)
                      }
                      type="button"
                    >
                      {boxEncryptShowPrivateKey ? (
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
                    value={boxEncryptRecipientPublicKey}
                    onChange={event =>
                      setBoxEncryptRecipientPublicKey(event.target.value)
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
                    value={boxEncryptMessage}
                    onChange={event => setBoxEncryptMessage(event.target.value)}
                    rows={4}
                    placeholder="输入要加密的消息"
                  />

                  <div className="web3-box-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleEncryptOnly}
                      type="button"
                    >
                      <Lock size={16} />
                      加密
                    </button>
                  </div>

                  {boxEncryptError && (
                    <p className="web3-tools-danger">{boxEncryptError}</p>
                  )}

                  <div className="web3-box-result">
                    <label className="web3-box-result-header">
                      <span>密文</span>
                    </label>
                    <textarea
                      className="textarea mono"
                      value={boxEncryptCipherText}
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
                      <p>
                        只输入发送方公钥和接收方私钥即可解密，无需生成完整账号。
                      </p>
                    </div>
                  </div>

                  <label className="web3-box-result-header">
                    <span>发送方</span>
                  </label>
                  <input
                    type="text"
                    placeholder="发送方 x25519 公钥"
                    value={boxDecryptSenderPublicKey}
                    onChange={event =>
                      setBoxDecryptSenderPublicKey(event.target.value)
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
                      type={boxDecryptShowPrivateKey ? 'text' : 'password'}
                      placeholder="接收方 x25519 私钥"
                      value={boxDecryptRecipientPrivateKey}
                      onChange={event =>
                        setBoxDecryptRecipientPrivateKey(event.target.value)
                      }
                      className="input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <button
                      className="input-eye"
                      onClick={() =>
                        setBoxDecryptShowPrivateKey(!boxDecryptShowPrivateKey)
                      }
                      type="button"
                    >
                      {boxDecryptShowPrivateKey ? (
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
                    value={boxDecryptCipherText}
                    onChange={event =>
                      setBoxDecryptCipherText(event.target.value)
                    }
                    rows={5}
                    placeholder="粘贴要解密的密文"
                  />

                  <div className="web3-box-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={handleDecryptOnly}
                      type="button"
                    >
                      <KeyRound size={16} />
                      解密
                    </button>
                  </div>

                  {boxDecryptError && (
                    <p className="web3-tools-danger">{boxDecryptError}</p>
                  )}

                  <div className="web3-box-result">
                    <label className="web3-box-result-header">
                      <span>解密结果</span>
                    </label>
                    <textarea
                      className="textarea mono"
                      value={boxDecryptResult}
                      readOnly
                      rows={5}
                      placeholder="解密成功后显示明文"
                    />
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
