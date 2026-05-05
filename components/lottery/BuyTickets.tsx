'use client'

import React, { useState } from 'react'
import { useLotteryStore } from './LotteryStore'

export function BuyTickets() {
  const [amount, setAmount] = useState('')
  const { buyTickets, status, isConnected, isConnecting, connectWallet } =
    useLotteryStore()

  const parsed = parseInt(amount, 10)
  const isValid =
    !isNaN(parsed) && parsed > 0 && Number.isInteger(Number(amount))

  const handleBuy = () => {
    if (!isValid) return
    buyTickets(parsed)
    setAmount('')
  }

  const isDisabled = status !== 'buying' || !isValid

  if (!isConnected) {
    return (
      <div className="lottery-buy-section">
        <div className="lottery-buy-title">购买彩票</div>
        <button
          className="lottery-buy-btn"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? '连接中...' : '连接钱包'}
        </button>
      </div>
    )
  }

  return (
    <div className="lottery-buy-section">
      <div className="lottery-buy-title">购买彩票</div>
      <div className="lottery-buy-controls">
        <div className="lottery-usdt-input-wrapper">
          <label className="lottery-usdt-label">转入 USDT 数量</label>
          <div className="lottery-usdt-input-row">
            <input
              type="number"
              className="lottery-usdt-input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="输入整数"
              min={1}
              step={1}
            />
            <span className="lottery-usdt-unit">USDT</span>
          </div>
          {amount && !isValid && (
            <span className="lottery-usdt-error">请输入正整数</span>
          )}
        </div>

        {isValid && (
          <div className="lottery-buy-summary">
            <span className="lottery-buy-summary-text">
              = {parsed} 张彩票
            </span>
            <span className="lottery-buy-summary-hint">
              每张 1 USDT · 整数金额
            </span>
          </div>
        )}

        <button
          className="lottery-buy-btn"
          onClick={handleBuy}
          disabled={isDisabled}
        >
          {status !== 'buying'
            ? '购票已关闭'
            : `购买 ${parsed || 0} 张彩票`}
        </button>
      </div>
    </div>
  )
}
