'use client'

import React, { useState, useEffect } from 'react'
import { useLotteryStore } from './LotteryStore'

export function LotteryDashboard() {
  const { currentRound, prizePool, totalTickets, endTime, status } =
    useLotteryStore()
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const end = endTime.getTime()
      const diff = Math.max(0, end - now)

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft({ hours, minutes, seconds })
    }, 1000)

    return () => clearInterval(interval)
  }, [endTime])

  return (
    <div className="lottery-dashboard">
      {/* Stats Grid */}
      <div className="lottery-stats-grid">
        <div className="lottery-stat-card">
          <div className="lottery-stat-label">当前轮次</div>
          <div className="lottery-stat-value accent">#{currentRound}</div>
        </div>
        <div className="lottery-stat-card">
          <div className="lottery-stat-label">奖池金额</div>
          <div className="lottery-stat-value gold">{prizePool} USDC</div>
        </div>
        <div className="lottery-stat-card">
          <div className="lottery-stat-label">已售票数</div>
          <div className="lottery-stat-value">{totalTickets}</div>
        </div>
        <div className="lottery-stat-card">
          <div className="lottery-stat-label">状态</div>
          <div className="lottery-stat-value accent">
            {status === 'buying'
              ? '购票中'
              : status === 'drawing'
                ? '开奖中'
                : '已结束'}
          </div>
        </div>
      </div>

      {/* Countdown */}
      <div className="lottery-countdown">
        <div className="lottery-countdown-label">距离开奖还有</div>
        <div className="lottery-countdown-timer">
          <div className="lottery-countdown-unit">
            <div className="lottery-countdown-number">{timeLeft.hours}</div>
            <div className="lottery-countdown-text">小时</div>
          </div>
          <div className="lottery-countdown-unit">
            <div className="lottery-countdown-number">{timeLeft.minutes}</div>
            <div className="lottery-countdown-text">分钟</div>
          </div>
          <div className="lottery-countdown-unit">
            <div className="lottery-countdown-number">{timeLeft.seconds}</div>
            <div className="lottery-countdown-text">秒</div>
          </div>
        </div>
      </div>
    </div>
  )
}
