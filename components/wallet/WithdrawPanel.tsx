'use client'

import React, { useState } from 'react'
import { ethers } from 'ethers'
import { ArrowUpRight, Loader2, Check, AlertTriangle, ExternalLink } from 'lucide-react'

interface WithdrawPanelProps {
  contract: ethers.Contract
  wallet: ethers.Wallet
  userAddress: string
  balance: string
  nonce: number
  decimals: number
  blockExplorer: string
  onRefresh: () => void
}

export default function WithdrawPanel({
  contract,
  wallet,
  userAddress,
  balance,
  nonce,
  decimals,
  blockExplorer,
  onRefresh,
}: WithdrawPanelProps) {
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const feeBps = 50 // 0.5%
  const feeRate = feeBps / 10000
  const withdrawAmount = parseFloat(amount) || 0
  const fee = withdrawAmount * feeRate
  const receiveAmount = withdrawAmount - fee

  const handleWithdraw = async () => {
    setError(null)
    setTxHash(null)
    setSuccess(false)

    if (!ethers.isAddress(toAddress)) {
      setError('请输入有效的以太坊地址')
      return
    }

    const amountUnits = ethers.parseUnits(amount, decimals)
    const balanceUnits: bigint = ethers.parseUnits(balance, decimals)

    if (Number(amountUnits) <= 0) {
      setError('请输入有效数量')
      return
    }

    if (Number(amountUnits) > Number(balanceUnits)) {
      setError('余额不足')
      return
    }

    setLoading(true)

    try {
      // Build EIP-712 domain and types
      const domain = {
        name: 'MostBoxWallet',
        version: '1',
        chainId: 84532, // Base Sepolia
        verifyingContract: await contract.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      }

      const value = {
        to: toAddress,
        amount: amountUnits,
        nonce,
      }

      // Sign with user's private key
      const signature = await wallet.signTypedData(domain, types, value)

      // Call withdraw on contract
      const tx = await (contract as any)
        .connect(wallet)
        .withdraw(toAddress, amountUnits, nonce, signature)

      setTxHash(tx.hash)

      // Wait for confirmation
      await tx.wait()

      setSuccess(true)
      onRefresh()
    } catch (err: any) {
      console.error('Withdraw failed:', err)
      if (err.code === 'ACTION_REJECTED') {
        setError('用户取消了交易')
      } else if (err.reason) {
        setError(`交易失败: ${err.reason}`)
      } else {
        setError(`交易失败: ${err.message || '未知错误'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="withdraw-panel">
      <div className="withdraw-form">
        <div className="withdraw-field">
          <label className="withdraw-label">提现地址</label>
          <input
            type="text"
            placeholder="0x..."
            value={toAddress}
            onChange={e => setToAddress(e.target.value)}
            className="withdraw-input"
            disabled={loading || success}
          />
        </div>

        <div className="withdraw-field">
          <label className="withdraw-label">提现数量 (USDT)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="withdraw-input"
            disabled={loading || success}
            step="0.01"
            min="0"
          />
          <div className="withdraw-balance-hint">
            可用: {balance} USDT
          </div>
        </div>

        {withdrawAmount > 0 && (
          <div className="withdraw-summary">
            <div className="withdraw-summary-row">
              <span>提现金额</span>
              <span>{withdrawAmount.toFixed(2)} USDT</span>
            </div>
            <div className="withdraw-summary-row">
              <span>手续费 (0.5%)</span>
              <span>-{fee.toFixed(2)} USDT</span>
            </div>
            <div className="withdraw-summary-row total">
              <span>实际到账</span>
              <span>{receiveAmount.toFixed(2)} USDT</span>
            </div>
          </div>
        )}

        {error && (
          <div className="withdraw-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && txHash && (
          <div className="withdraw-success">
            <Check size={16} />
            <span>提现成功！</span>
            <a
              href={`${blockExplorer}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="withdraw-tx-link"
            >
              查看交易 <ExternalLink size={12} />
            </a>
          </div>
        )}

        <button
          onClick={handleWithdraw}
          className="withdraw-btn primary"
          disabled={loading || success || !toAddress || !amount}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="spin" />
              处理中...
            </>
          ) : (
            <>
              <ArrowUpRight size={16} />
              确认提现
            </>
          )}
        </button>
      </div>

      <div className="withdraw-info">
        <h4 className="withdraw-info-title">提现说明</h4>
        <ul className="withdraw-info-list">
          <li>提现需要签名验证，确保资金安全</li>
          <li>每笔提现收取 0.5% 手续费</li>
          <li>单笔提现上限 1000 USDT</li>
          <li>交易确认后资金将发送到指定地址</li>
        </ul>
      </div>
    </div>
  )
}
