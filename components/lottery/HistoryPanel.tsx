'use client'

import React from 'react'
import { useLotteryStore } from './LotteryStore'

export function HistoryPanel() {
  const { history } = useLotteryStore()

  if (history.length === 0) {
    return (
      <div className="lottery-empty-state">
        <p>暂无开奖记录</p>
      </div>
    )
  }

  return (
    <div className="lottery-history-list">
      {history.map(entry => (
        <div key={entry.roundId} className="lottery-history-item">
          <div className="lottery-history-header">
            <span className="lottery-history-round">第 {entry.roundId} 轮</span>
            <span className="lottery-history-date">
              {new Date(entry.date).toLocaleString('zh-CN')}
            </span>
          </div>
          <div className="lottery-history-pool">
            奖池:{' '}
            <span className="lottery-history-pool-amount">
              {entry.prizePool} USDC
            </span>
          </div>
          <div className="lottery-history-winners">
            {entry.winners.map((winner, idx) => (
              <div key={idx} className="lottery-history-winner">
                <div>
                  <div className="lottery-winner-tier">{winner.tier}</div>
                  <div className="lottery-winner-address">{winner.address}</div>
                </div>
                <div className="lottery-winner-amount">
                  {`+${winner.amount}`} USDC
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
