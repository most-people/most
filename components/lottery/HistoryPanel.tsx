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
          <div className="lottery-history-meta">
            <span className="lottery-history-pool">
              奖池:{" "}
              <span className="lottery-history-pool-amount">
                {entry.prizePool} USDT
              </span>
            </span>
            <span className="lottery-history-total">
              总票数: {entry.totalTickets}
            </span>
          </div>
          <div className="lottery-history-winners">
            {entry.winners.map((winner, idx) => (
              <div key={idx} className="lottery-history-winner">
                <div>
                  <div className="lottery-winner-tier">{winner.tier}</div>
                  <div className="lottery-winner-address">
                    {winner.address}
                  </div>
                </div>
                <div className="lottery-winner-amount">
                  {`+${winner.amount}`} USDT
                </div>
              </div>
            ))}
          </div>
          {entry.myResult && (
            <div className={`lottery-my-result ${entry.myResult}`}>
              你在本轮:
              {entry.myResult === 'winner' && ` 中奖 +${entry.myPrize} USDT`}
              {entry.myResult === 'participation' &&
                ` 参与奖 +${entry.myPrize} USDT`}
              {entry.myResult === 'loser' && ' 未中奖'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
