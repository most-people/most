'use client'

import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { HDNodeWallet } from 'ethers'
import {
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  ArrowLeft,
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
  Download,
  User,
  Lock,
  Wallet,
} from 'lucide-react'
import AppShell from '../../components/AppShell'
import { useApp } from '../app/AppProvider'
import {
  mostWallet,
  mostMnemonic,
  most25519,
} from '../../src/utils/mostWallet.js'
import { getEdKeyPair, getIPNS } from '../../src/utils/mp.js'
import { generateAvatar } from '../../src/utils/avatar.js'

/* ─── Helpers ─── */

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      className="copy-btn"
      onClick={handleCopy}
      title={copied ? '已复制' : '复制'}
    >
      <Copy size={14} />
      {copied && <span className="copy-hint">已复制</span>}
    </button>
  )
}

function KeyCard({ title, icon, children, accent = false }) {
  return (
    <div className={`web3-key-card ${accent ? 'accent' : ''}`}>
      <div className="web3-key-card-header">
        <span className="web3-key-card-icon">{icon}</span>
        <span className="web3-key-card-title">{title}</span>
      </div>
      <div className="web3-key-card-body">{children}</div>
    </div>
  )
}

function EmptyState({ icon, message }) {
  return (
    <div className="empty-state glass">
      <div className="empty-state-icon">{icon}</div>
      <p>{message}</p>
    </div>
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

function PemBlock({ label, pem, filename }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pem)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const handleDownload = () => {
    const blob = new Blob([pem], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="web3-pem-block">
      <div className="web3-pem-header">
        <span className="web3-pem-label">{label}</span>
        <div className="web3-pem-actions">
          <button
            className="btn small"
            onClick={handleCopy}
            title={copied ? '已复制' : '复制'}
          >
            <Copy size={14} />
            {copied ? '已复制' : '复制'}
          </button>
          <button
            className="btn small primary"
            onClick={handleDownload}
            title="下载"
          >
            <Download size={14} />
            下载
          </button>
        </div>
      </div>
      <textarea className="textarea mono" value={pem} readOnly rows={6} />
    </div>
  )
}

/* ─── Main Page ─── */

export default function Web3Page() {
  const { isDarkMode, setIsDarkMode } = useApp()

  /* view */
  const [currentView, setCurrentView] = useState('identity')

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

  /* compute results */
  useEffect(() => {
    if (username.trim()) {
      const result = mostWallet(username.trim(), password)
      setWalletResult(result)
      setMnemonicPhrase(mostMnemonic(result.danger))
      const k = most25519(result.danger)
      setKeys(k)
      setIpns(getIPNS(k.private_key, k.ed_public_key))
      const pair = getEdKeyPair(k.private_key, k.ed_public_key)
      setPrivatePem(ed25519ToPKCS8PEM(pair.secretKey))
      setPublicPem(ed25519PublicKeyToPEM(pair.publicKey))
    } else {
      setWalletResult(null)
      setKeys(null)
      setIpns('')
      setPrivatePem('')
      setPublicPem('')
      setMnemonicPhrase('')
    }
    setDeriveList([])
    setDeriveIndex(0)
    setShowAddressQr(false)
    setShowMnemonicReveal(false)
    setShowMnemonicQr(false)
    setShowX25519Private(false)
  }, [username, password])

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
    currentView === 'identity'
      ? 'Web3'
      : currentView === 'pem'
        ? 'PEM 导出'
        : 'Wallet 导出'

  const sidebarNavItems = [
    {
      id: 'identity',
      icon: <User size={16} />,
      label: 'Web3',
    },
    { id: 'pem', icon: <Lock size={16} />, label: 'PEM 导出' },
    { id: 'tools', icon: <Wallet size={16} />, label: 'Wallet 导出' },
  ]

  return (
    <AppShell
      showBackendWarning={false}
      sidebar={({ closeSidebar }) => (
        <>
          <div className="sidebar-header">
            <button
              className="back-btn"
              onClick={() => (window.location.href = '/app/')}
              title="返回文件管理"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <nav className="sidebar-nav">
            {sidebarNavItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id)
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
          className="icon-btn"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="切换主题"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      }
    >
      <div className="web3-page">
        <div className="web3-container">
          {/* ── Shared Input Area ── */}
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
          </div>

          {/* ── View: Identity & Keys ── */}
          {currentView === 'identity' && (
            <>
              {hasValidWallet && effectiveAddress ? (
                <>
                  <div className="web3-identity-card">
                    <img
                      src={avatarSrc}
                      alt="avatar"
                      className="web3-identity-avatar"
                    />
                    <div className="web3-identity-info">
                      <h1 className="web3-identity-name">
                        {walletResult?.username || '匿名'}
                      </h1>
                      <div className="web3-identity-address">
                        <code>{effectiveAddress.toLowerCase()}</code>
                        <CopyButton text={effectiveAddress.toLowerCase()} />
                        <a
                          href={`https://web3.okx.com/zh-hans/portfolio/${effectiveAddress}`}
                          target="_blank"
                          rel="noreferrer"
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
                        <div className="web3-private-toggle">
                          <span className="hint-text">
                            点击眼睛图标查看私钥
                          </span>
                          <button
                            className="input-eye"
                            onClick={() =>
                              setShowX25519Private(!showX25519Private)
                            }
                          >
                            {showX25519Private ? (
                              <Eye size={16} />
                            ) : (
                              <EyeOff size={16} />
                            )}
                          </button>
                        </div>
                        <div className="mono-row danger">
                          <code className="mono">
                            {showX25519Private
                              ? keys.private_key
                              : mask(keys.private_key)}
                          </code>
                          {showX25519Private && (
                            <CopyButton text={keys.private_key} />
                          )}
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
          {currentView === 'tools' && (
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
                        <button className="btn primary" onClick={handleDerive}>
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
        </div>
      </div>
    </AppShell>
  )
}
