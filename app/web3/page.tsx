'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Fingerprint,
  Shield,
  Globe,
  LogIn,
  LogOut,
} from 'lucide-react'
import {
  loadIdentity,
  saveIdentity,
  createLoginIdentity,
} from '../../src/utils/userIdentity.js'
import { most25519 } from '../../src/utils/mostWallet.js'
import { getIPNS, formatTime } from '../../src/utils/mp.js'
import { generateAvatar } from '../../src/utils/avatar.js'

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
      className="web3-copy-btn"
      onClick={handleCopy}
      title={copied ? '已复制' : '复制'}
    >
      <Copy size={14} />
      {copied && <span className="web3-copy-hint">已复制</span>}
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

export default function Web3Page() {
  const [identity, setIdentity] = useState<any>(null)
  const [mounted, setMounted] = useState(false)

  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [showX25519Private, setShowX25519Private] = useState(false)
  const [showEd25519Private, setShowEd25519Private] = useState(false)

  useEffect(() => {
    setMounted(true)
    const id = loadIdentity()
    if (id) setIdentity(id)
  }, [])

  const handleLogin = () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError('请输入用户名和密码')
      return
    }
    const id = createLoginIdentity(loginUsername.trim(), loginPassword)
    saveIdentity(id)
    setIdentity(id)
    setLoginError('')
  }

  const handleLogout = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mostbox_identity')
    }
    setIdentity(null)
  }

  if (!mounted) {
    return (
      <div className="web3-page">
        <div className="web3-loading" />
      </div>
    )
  }

  if (!identity || !identity.danger) {
    return (
      <div className="web3-page">
        <div className="web3-container narrow">
          <div className="web3-page-header">
            <Link href="/app" className="web3-back-btn">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="web3-page-title">Web3 身份</h1>
          </div>
          <div className="web3-login-card">
            <div className="web3-login-avatar">
              <KeyRound size={40} />
            </div>
            <h2>Web3 身份验证</h2>
            <p className="web3-login-desc">
              登录以查看您的密钥、地址和派生工具
            </p>

            <div className="web3-login-form">
              <input
                type="text"
                placeholder="用户名"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="web3-input"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <div className="web3-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密码"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
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
              {loginError && (
                <p className="web3-login-error">{loginError}</p>
              )}
              <button className="web3-btn primary" onClick={handleLogin}>
                <LogIn size={16} />
                登录
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { public_key, private_key, ed_public_key } = most25519(identity.danger)
  const ipns = getIPNS(private_key, ed_public_key)

  const mask = (s) => (s ? '•'.repeat(Math.min(s.length, 32)) : '-')

  return (
    <div className="web3-page">
      <div className="web3-container">
        <div className="web3-page-header">
          <Link href="/app" className="web3-back-btn">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="web3-page-title">Web3 身份</h1>
        </div>

        {/* Identity Card */}
        <div className="web3-identity-card">
          <img
            src={generateAvatar(identity.address)}
            alt="avatar"
            className="web3-identity-avatar"
          />
          <div className="web3-identity-info">
            <h1 className="web3-identity-name">
              {identity.displayName || identity.username}
            </h1>
            <div className="web3-identity-address">
              <code>{identity.address.toLowerCase()}</code>
              <CopyButton text={identity.address.toLowerCase()} />
              <a
                href={`https://web3.okx.com/zh-hans/portfolio/${identity.address}`}
                target="_blank"
                rel="noreferrer"
                className="web3-link"
              >
                <ExternalLink size={14} />
                查看
              </a>
            </div>
            <button
              className="web3-logout-btn"
              onClick={handleLogout}
              title="退出登录"
            >
              <LogOut size={14} />
              退出登录
            </button>
          </div>
        </div>

        {/* Key Grid */}
        <div className="web3-key-grid">
          <KeyCard
            title="Ed25519 公钥"
            icon={<Fingerprint size={18} />}
          >
            <div className="web3-mono-row">
              <code className="web3-mono">{ed_public_key}</code>
              <CopyButton text={ed_public_key} />
            </div>
            <Link href="/web3/ed25519" className="web3-inline-link">
              PEM 格式 <ArrowRight size={12} />
            </Link>
          </KeyCard>

          <KeyCard
            title="x25519 公钥"
            icon={<KeyRound size={18} />}
          >
            <div className="web3-mono-row">
              <code className="web3-mono">{public_key}</code>
              <CopyButton text={public_key} />
            </div>
          </KeyCard>

          <KeyCard
            title="x25519 & Ed25519 私钥"
            icon={<Shield size={18} />}
            accent
          >
            <div className="web3-private-toggle">
              <span className="web3-private-hint">
                点击眼睛图标查看私钥
              </span>
              <button
                className="web3-eye-btn"
                onClick={() => setShowX25519Private(!showX25519Private)}
              >
                {showX25519Private ? (
                  <Eye size={16} />
                ) : (
                  <EyeOff size={16} />
                )}
              </button>
            </div>
            <div className="web3-mono-row danger">
              <code className="web3-mono">
                {showX25519Private ? private_key : mask(private_key)}
              </code>
              {showX25519Private && <CopyButton text={private_key} />}
            </div>
          </KeyCard>

          <KeyCard
            title="IPNS ID"
            icon={<Globe size={18} />}
          >
            <div className="web3-mono-row">
              <code className="web3-mono">{ipns}</code>
              <CopyButton text={ipns} />
            </div>
          </KeyCard>
        </div>

        {/* Footer */}
        <div className="web3-footer">
          <Link href="/web3/tools" className="web3-tool-link">
            <span>导出钱包工具</span>
            <ArrowRight size={16} />
          </Link>
          <p className="web3-footer-time">{formatTime(new Date().getTime())}</p>
        </div>
      </div>
    </div>
  )
}
