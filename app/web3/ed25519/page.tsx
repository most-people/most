'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  Copy,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react'
import { loadIdentity } from '../../../src/utils/userIdentity.js'
import { most25519 } from '../../../src/utils/mostWallet.js'
import { getEdKeyPair, getIPNS } from '../../../src/utils/mp.js'

const base64Encode = (bytes) => {
  return btoa(String.fromCharCode(...bytes))
}

const ed25519ToPKCS8PEM = (privateKey) => {
  const ed25519AlgorithmIdentifier = new Uint8Array([
    0x30, 0x05,
    0x06, 0x03,
    0x2b, 0x65, 0x70,
  ])
  const privateKeyOctetString = new Uint8Array([
    0x04, 0x22,
    0x04, 0x20,
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
  return `-----BEGIN PRIVATE KEY-----\n${base64
    .match(/.{1,64}/g)
    ?.join('\n')}\n-----END PRIVATE KEY-----`
}

const ed25519PublicKeyToPEM = (publicKey) => {
  const ed25519AlgorithmIdentifier = new Uint8Array([
    0x30, 0x05,
    0x06, 0x03,
    0x2b, 0x65, 0x70,
  ])
  const publicKeyBitString = new Uint8Array([
    0x03, 0x21,
    0x00,
    ...publicKey,
  ])
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
  return `-----BEGIN PUBLIC KEY-----\n${base64
    .match(/.{1,64}/g)
    ?.join('\n')}\n-----END PUBLIC KEY-----`
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
            className="web3-pem-btn"
            onClick={handleCopy}
            title={copied ? '已复制' : '复制'}
          >
            <Copy size={14} />
            {copied ? '已复制' : '复制'}
          </button>
          <button
            className="web3-pem-btn primary"
            onClick={handleDownload}
            title="下载"
          >
            <Download size={14} />
            下载
          </button>
        </div>
      </div>
      <textarea
        className="web3-pem-textarea"
        value={pem}
        readOnly
        rows={6}
      />
    </div>
  )
}

export default function Web3Ed25519Page() {
  const [identity, setIdentity] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [privatePem, setPrivatePem] = useState('')
  const [publicPem, setPublicPem] = useState('')
  const [ipns, setIpns] = useState('')
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    setMounted(true)
    const id = loadIdentity()
    if (id && id.danger) {
      setIdentity(id)
      const { private_key, ed_public_key } = most25519(id.danger)
      const pair = getEdKeyPair(private_key, ed_public_key)
      setPrivatePem(ed25519ToPKCS8PEM(pair.secretKey))
      setPublicPem(ed25519PublicKeyToPEM(pair.publicKey))
      setIpns(getIPNS(private_key, ed_public_key))
    }
  }, [])

  if (!mounted) {
    return (
      <div className="web3-page">
        <div className="web3-loading" />
      </div>
    )
  }

  if (!identity) {
    return (
      <div className="web3-page">
        <div className="web3-login-card">
          <h2>需要登录</h2>
          <p className="web3-login-desc">
            请先登录以查看 Ed25519 PEM 密钥
          </p>
          <Link href="/web3" className="web3-btn primary">
            <LogIn size={16} />
            前往登录
          </Link>
        </div>
      </div>
    )
  }

  const username = identity.username || 'wallet'

  return (
    <div className="web3-page">
      <div className="web3-container narrow">
        <div className="web3-page-header">
          <Link href="/web3" className="web3-back-btn">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="web3-page-title">Ed25519 PEM 密钥库</h1>
        </div>

        <div className="web3-pem-list">
          <PemBlock
            label={`${username}.pub`}
            pem={publicPem}
            filename={`${username}.pub`}
          />
          <PemBlock
            label={`${username}.pem`}
            pem={privatePem}
            filename={`${username}.pem`}
          />
        </div>

        <div className="web3-ipns-bar">
          <span className="web3-ipns-label">IPNS ID</span>
          <code className="web3-ipns-value">{ipns || '-'}</code>
        </div>

        <div className="web3-raw-section">
          <button
            className="web3-raw-toggle"
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? <EyeOff size={14} /> : <Eye size={14} />}
            {showRaw ? '隐藏原始密钥' : '显示原始密钥'}
          </button>
          {showRaw && (
            <div className="web3-raw-grid">
              <div className="web3-raw-item">
                <span className="web3-raw-label">ETH 地址</span>
                <code className="web3-raw-value">
                  {identity.address.toLowerCase()}
                </code>
              </div>
              <div className="web3-raw-item">
                <span className="web3-raw-label">Ed25519 公钥 (hex)</span>
                <code className="web3-raw-value">{most25519(identity.danger).ed_public_key}</code>
              </div>
              <div className="web3-raw-item">
                <span className="web3-raw-label">Ed25519 私钥 (hex)</span>
                <code className="web3-raw-value danger">
                  {most25519(identity.danger).private_key}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
