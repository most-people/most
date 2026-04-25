'use client'

import React, { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Info, ExternalLink } from 'lucide-react'

interface DepositPanelProps {
  contractAddress: string
  usdtAddress: string
  userAddress: string
  blockExplorer: string
  onRefresh: () => void
}

export default function DepositPanel({
  contractAddress,
  usdtAddress,
  userAddress,
  blockExplorer,
  onRefresh,
}: DepositPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contractAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="deposit-panel">
      <div className="deposit-qr-section">
        <h3 className="deposit-section-title">充值地址</h3>
        <div className="deposit-qr-container">
          <QRCodeSVG value={contractAddress} size={180} />
        </div>
        <div className="deposit-address-box">
          <code className="deposit-address">{contractAddress}</code>
          <button className="deposit-copy-btn" onClick={handleCopy} title="复制地址">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="deposit-steps">
        <h3 className="deposit-section-title">充值步骤</h3>
        <ol className="deposit-steps-list">
          <li className="deposit-step">
            <span className="deposit-step-num">1</span>
            <div className="deposit-step-content">
              <strong>打开你的钱包</strong>
              <p>使用 MetaMask 或其他支持 Base 链的钱包</p>
            </div>
          </li>
          <li className="deposit-step">
            <span className="deposit-step-num">2</span>
            <div className="deposit-step-content">
              <strong>切换到 Base 链</strong>
              <p>确保钱包网络设置为 Base (Chain ID: 8453)</p>
            </div>
          </li>
          <li className="deposit-step">
            <span className="deposit-step-num">3</span>
            <div className="deposit-step-content">
              <strong>发送 USDT</strong>
              <p>向上方地址发送 USDT，合约会自动记录你的余额</p>
            </div>
          </li>
          <li className="deposit-step">
            <span className="deposit-step-num">4</span>
            <div className="deposit-step-content">
              <strong>调用 deposit()</strong>
              <p>
                在区块浏览器中调用合约的{' '}
                <code className="inline-code">deposit(amount)</code> 函数
                （需要先 approve）
              </p>
            </div>
          </li>
        </ol>
      </div>

      <div className="deposit-info-card">
        <Info size={16} />
        <div className="deposit-info-content">
          <p>
            <strong>注意：</strong>充值需要少量 ETH 作为 Gas 费。
            请确保你的钱包有足够的 ETH。
          </p>
          <a
            href={`${blockExplorer}/address/${usdtAddress}`}
            target="_blank"
            rel="noreferrer"
            className="deposit-info-link"
          >
            查看 USDT 合约 <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <div className="deposit-user-address">
        <h4 className="deposit-user-address-title">你的链上地址</h4>
        <code className="deposit-user-address-code">{userAddress.toLowerCase()}</code>
        <p className="deposit-user-address-hint">
          此地址由你的用户名和密码派生，用于标识你的余额
        </p>
      </div>
    </div>
  )
}
