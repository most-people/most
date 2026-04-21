'use client'

import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { HDNodeWallet } from 'ethers'
import {
  Eye,
  EyeOff,
  Copy,
  ArrowLeft,
  QrCode,
  KeyRound,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { mostWallet, mostMnemonic } from '../../../src/utils/mostWallet.js'
import { generateAvatar } from '../../../src/utils/avatar.js'

interface DeriveAddress {
  index: number
  address: string
  privateKey: string
}

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
    <button className="web3-copy-btn" onClick={handleCopy} title="复制">
      <Copy size={14} />
      {copied && <span className="web3-copy-hint">已复制</span>}
    </button>
  )
}

export default function Web3ToolsPage() {
  const [useMnemonicMode, setUseMnemonicMode] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [inputMnemonic, setInputMnemonic] = useState('')
  const [validatedMnemonic, setValidatedMnemonic] = useState('')
  const [mnemonicError, setMnemonicError] = useState('')

  const [address, setAddress] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [showAddressQr, setShowAddressQr] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [showMnemonicQr, setShowMnemonicQr] = useState(false)

  const [deriveList, setDeriveList] = useState<DeriveAddress[]>([])
  const [deriveIndex, setDeriveIndex] = useState(0)
  const [deriveShowIndex, setDeriveShowIndex] = useState(true)
  const [deriveShowAddress, setDeriveShowAddress] = useState(true)
  const [deriveShowPrivateKey, setDeriveShowPrivateKey] = useState(false)

  useEffect(() => {
    if (useMnemonicMode) {
      if (validatedMnemonic) {
        try {
          const wallet = HDNodeWallet.fromPhrase(validatedMnemonic)
          setAddress(wallet.address)
          setMnemonic(validatedMnemonic)
        } catch {
          setAddress('')
          setMnemonic('')
        }
      } else {
        setAddress('')
        setMnemonic('')
      }
    } else {
      if (username.trim()) {
        const { address: addr, danger } = mostWallet(username.trim(), password)
        setAddress(addr)
        setMnemonic(mostMnemonic(danger))
      } else {
        setAddress('')
        setMnemonic('')
      }
    }
    setDeriveList([])
    setDeriveIndex(0)
    setShowAddressQr(false)
    setShowMnemonic(false)
    setShowMnemonicQr(false)
  }, [username, password, useMnemonicMode, validatedMnemonic])

  const validateMnemonic = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      setValidatedMnemonic('')
      setMnemonicError('')
      return
    }
    try {
      HDNodeWallet.fromPhrase(trimmed)
      setValidatedMnemonic(trimmed)
      setMnemonicError('')
    } catch (err) {
      setValidatedMnemonic('')
      setMnemonicError('无效助记词')
    }
  }

  const deriveBatch = 10

  const handleDerive = () => {
    if (!mnemonic) return
    const list: DeriveAddress[] = []
    for (let i = deriveIndex; i < deriveIndex + deriveBatch; i++) {
      const path = `m/44'/60'/0'/0/${i}`
      const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path)
      list.push({
        index: i,
        address: wallet.address,
        privateKey: wallet.privateKey,
      })
    }
    setDeriveList(prev => [...prev, ...list])
    setDeriveIndex(prev => prev + deriveBatch)
  }

  const hasValidWallet = useMnemonicMode
    ? !!validatedMnemonic && !!address
    : !!username.trim()

  const avatarSrc = generateAvatar(address || undefined)

  return (
    <div className="web3-page">
      <div className="web3-container tools">
        <div className="web3-page-header">
          <Link href="/web3" className="web3-back-btn">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="web3-page-title">钱包工具箱</h1>
        </div>

        {/* Mode Switcher */}
        <div className="web3-mode-switcher">
          <button
            className={`web3-mode-pill ${!useMnemonicMode ? 'active' : ''}`}
            onClick={() => {
              setUseMnemonicMode(false)
              setInputMnemonic('')
              setValidatedMnemonic('')
              setMnemonicError('')
              setShowPassword(false)
            }}
          >
            <KeyRound size={14} />
            用户名 + 密码
          </button>
          <button
            className={`web3-mode-pill ${useMnemonicMode ? 'active' : ''}`}
            onClick={() => {
              setUseMnemonicMode(true)
              setUsername('')
              setPassword('')
            }}
          >
            助记词
          </button>
        </div>

        {/* Inputs */}
        <div className="web3-tools-inputs">
          {!useMnemonicMode ? (
            <>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="web3-input"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <div className="web3-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密码"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="web3-input"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
                <button
                  className="web3-input-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="web3-tools-warning">
                <ShieldAlert size={14} />
                请确保在安全环境中输入助记词，任何拥有您助记词的人都可以控制您的钱包！
              </p>
              <textarea
                placeholder="请输入助记词（12或24个单词，用空格分隔）"
                value={inputMnemonic}
                onChange={e => setInputMnemonic(e.target.value)}
                onBlur={e => validateMnemonic(e.target.value)}
                className="web3-textarea"
                rows={3}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
              />
              {mnemonicError && (
                <p className="web3-tools-error">{mnemonicError}</p>
              )}
            </>
          )}
        </div>

        {/* Identity Preview */}
        {hasValidWallet && address && (
          <div className="web3-tools-preview">
            <img src={avatarSrc} alt="avatar" className="web3-tools-avatar" />
            <div className="web3-tools-address">
              <span>ETH 地址</span>
              <code>{address}</code>
              <CopyButton text={address} />
            </div>
          </div>
        )}

        {/* Address QR */}
        {hasValidWallet && (
          <div className="web3-tools-section">
            <button
              className="web3-tools-toggle"
              onClick={() => setShowAddressQr(!showAddressQr)}
            >
              <QrCode size={14} />
              {showAddressQr ? '隐藏二维码' : '显示地址二维码'}
              {showAddressQr ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
            {showAddressQr && (
              <div className="web3-qr-wrap">
                <QRCodeSVG value={address} size={200} />
              </div>
            )}
          </div>
        )}

        {/* Mnemonic */}
        {hasValidWallet && mnemonic && (
          <div className="web3-tools-section">
            <button
              className="web3-tools-toggle"
              onClick={() => setShowMnemonic(!showMnemonic)}
            >
              <KeyRound size={14} />
              {showMnemonic ? '隐藏助记词' : '显示助记词'}
              {showMnemonic ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
            {showMnemonic && (
              <div className="web3-mnemonic-reveal">
                <div className="web3-mnemonic-card">
                  <p className="web3-mnemonic-text">{mnemonic}</p>
                  <CopyButton text={mnemonic} />
                </div>
                <p className="web3-tools-danger">
                  <ShieldAlert size={14} />
                  任何拥有您助记词的人都可以窃取您账户中的任何资产，切勿泄露！！！
                </p>
                <button
                  className="web3-tools-toggle"
                  onClick={() => setShowMnemonicQr(!showMnemonicQr)}
                >
                  {showMnemonicQr ? '隐藏助记词二维码' : '显示助记词二维码'}
                </button>
                {showMnemonicQr && (
                  <div className="web3-qr-wrap">
                    <QRCodeSVG value={mnemonic} size={260} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Derive Addresses */}
        {showMnemonic && mnemonic && (
          <div className="web3-tools-section">
            <button className="web3-btn primary" onClick={handleDerive}>
              派生 {deriveBatch} 个地址
            </button>
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
                        onClick={() => setDeriveShowIndex(!deriveShowIndex)}
                        className="web3-derive-th"
                      >
                        账户
                      </th>
                      <th
                        onClick={() => setDeriveShowAddress(!deriveShowAddress)}
                        className="web3-derive-th"
                      >
                        地址
                      </th>
                      <th
                        onClick={() =>
                          setDeriveShowPrivateKey(!deriveShowPrivateKey)
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
      </div>
    </div>
  )
}
