'use client'

import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Wallet, ArrowLeft, ArrowUpRight, ArrowDownLeft, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { mostWallet } from '~/server/src/utils/mostWallet.js'
import { CONTRACT_CONFIG, MOSTBOX_WALLET_ABI, USDT_DECIMALS } from '~/lib/contracts/config'
import DepositPanel from './DepositPanel'
import WithdrawPanel from './WithdrawPanel'
import TransactionHistory from './TransactionHistory'

type Tab = 'deposit' | 'withdraw' | 'history'

export default function WalletDashboard() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [balance, setBalance] = useState<string>('0')
  const [nonce, setNonce] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('deposit')
  const [walletInstance, setWalletInstance] = useState<ethers.Wallet | null>(null)
  const [contract, setContract] = useState<ethers.Contract | null>(null)
  const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null)

  const config = CONTRACT_CONFIG.baseSepolia

  useEffect(() => {
    const p = new ethers.JsonRpcProvider(config.rpcUrl)
    setProvider(p)
  }, [config.rpcUrl])

  const handleLogin = async () => {
    if (!username.trim()) return
    setLoading(true)
    try {
      const result = mostWallet(username.trim(), password)
      const w = new ethers.Wallet(result.danger, provider!)
      setUserAddress(result.address)

      const c = new ethers.Contract(config.contractAddress, MOSTBOX_WALLET_ABI, provider)
      const bal = await c.balances(result.address)
      const n = await c.nonces(result.address)

      setBalance(ethers.formatUnits(bal, USDT_DECIMALS))
      setNonce(Number(n))
      setWalletInstance(w)
      setContract(c)
      setIsLoggedIn(true)
    } catch (err) {
      console.error('Login failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const refreshBalance = async () => {
    if (!contract || !userAddress) return
    try {
      const bal = await contract.balances(userAddress)
      const n = await contract.nonces(userAddress)
      setBalance(ethers.formatUnits(bal, USDT_DECIMALS))
      setNonce(Number(n))
    } catch (err) {
      console.error('Failed to refresh balance:', err)
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="wallet-page">
        <div className="wallet-container">
          <div className="wallet-login-card">
            <div className="wallet-login-icon">
              <Wallet size={48} />
            </div>
            <h1 className="wallet-login-title">MostBox Wallet</h1>
            <p className="wallet-login-subtitle">输入用户名和密码登录钱包</p>

            <div className="wallet-login-form">
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="wallet-input"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="wallet-input"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                onClick={handleLogin}
                className="wallet-btn primary"
                disabled={loading || !username.trim()}
              >
                {loading ? <Loader2 size={16} className="spin" /> : '登录钱包'}
              </button>
            </div>

            <p className="wallet-login-hint">
              钱包地址由用户名和密码确定性派生，无需额外注册
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="wallet-page">
      <div className="wallet-container">
        {/* Header */}
        <div className="wallet-header">
          <button className="wallet-back-btn" onClick={() => (window.location.href = '/')} title="返回首页">
            <ArrowLeft size={18} />
          </button>
          <div className="wallet-header-info">
            <h2 className="wallet-header-title">MostBox Wallet</h2>
            <div className="wallet-address-row">
              <code className="wallet-address">{userAddress.toLowerCase()}</code>
              <button
                className="wallet-copy-btn"
                onClick={() => navigator.clipboard.writeText(userAddress.toLowerCase())}
                title="复制地址"
              >
                <Copy size={14} />
              </button>
              <a
                href={`${config.blockExplorer}/address/${userAddress}`}
                target="_blank"
                rel="noreferrer"
                className="wallet-explorer-link"
              >
                <ExternalLink size={14} />
                浏览器
              </a>
            </div>
          </div>
        </div>

        {/* Balance Card */}
        <div className="wallet-balance-card">
          <div className="wallet-balance-label">可用余额</div>
          <div className="wallet-balance-amount">
            {balance} <span className="wallet-balance-currency">USDT</span>
          </div>
          <button className="wallet-refresh-btn" onClick={refreshBalance} title="刷新余额">
            <Loader2 size={14} />
            刷新
          </button>
        </div>

        {/* Tabs */}
        <div className="wallet-tabs">
          <button
            className={`wallet-tab ${activeTab === 'deposit' ? 'active' : ''}`}
            onClick={() => setActiveTab('deposit')}
          >
            <ArrowDownLeft size={16} />
            充值
          </button>
          <button
            className={`wallet-tab ${activeTab === 'withdraw' ? 'active' : ''}`}
            onClick={() => setActiveTab('withdraw')}
          >
            <ArrowUpRight size={16} />
            提现
          </button>
          <button
            className={`wallet-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Wallet size={16} />
            记录
          </button>
        </div>

        {/* Tab Content */}
        <div className="wallet-tab-content">
          {activeTab === 'deposit' && (
            <DepositPanel
              contractAddress={config.contractAddress}
              usdtAddress={config.usdtAddress}
              userAddress={userAddress}
              blockExplorer={config.blockExplorer}
              onRefresh={refreshBalance}
            />
          )}
          {activeTab === 'withdraw' && (
            <WithdrawPanel
              contract={contract!}
              wallet={walletInstance!}
              userAddress={userAddress}
              balance={balance}
              nonce={nonce}
              decimals={USDT_DECIMALS}
              blockExplorer={config.blockExplorer}
              onRefresh={refreshBalance}
            />
          )}
          {activeTab === 'history' && (
            <TransactionHistory
              contract={contract!}
              userAddress={userAddress}
              blockExplorer={config.blockExplorer}
            />
          )}
        </div>
      </div>
    </div>
  )
}
