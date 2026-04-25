'use client'

import React, { useState } from 'react'
import { useLotteryStore } from './LotteryStore'

export function BuyTickets() {
  const [quantity, setQuantity] = useState(1)
  const { buyTickets, status } = useLotteryStore()

  const pricePerTicket = 1
  const total = quantity * pricePerTicket

  const handleBuy = () => {
    buyTickets(quantity)
    setQuantity(1)
  }

  const isDisabled = status !== 'buying'

  return (
    <div className="lottery-buy-section">
      <div className="lottery-buy-title">购买彩票</div>
      <div className="lottery-buy-controls">
        <div className="lottery-quantity-selector">
          <button
            className="lottery-quantity-btn"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            -
          </button>
          <div className="lottery-quantity-value">{quantity}</div>
          <button
            className="lottery-quantity-btn"
            onClick={() => setQuantity(Math.min(100, quantity + 1))}
            disabled={quantity >= 100}
          >
            +
          </button>
        </div>

        <div className="lottery-total">
          总计: <span className="lottery-total-amount">{total} USDC</span>
        </div>

        <button
          className="lottery-buy-btn"
          onClick={handleBuy}
          disabled={isDisabled}
        >
          {isDisabled ? '购票已关闭' : `购买 ${quantity} 张彩票`}
        </button>
      </div>
    </div>
  )
}
