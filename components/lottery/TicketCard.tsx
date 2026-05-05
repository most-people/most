'use client'

import React from 'react'
import { Ticket } from 'lucide-react'
import { useLotteryStore } from './LotteryStore'

export function TicketCard() {
  const { myRounds, totalTickets } = useLotteryStore()

  if (myRounds.length === 0) {
    return (
      <div className="lottery-empty-state">
        <div className="lottery-empty-state-icon">
          <Ticket size={48} />
        </div>
        <p>还没有购买彩票</p>
        <p className="hint-text">前往仪表盘购买你的第一张彩票吧！</p>
      </div>
    )
  }

  return (
    <div className="lottery-tickets-grid">
      {myRounds.map(round => {
        const probability =
          totalTickets > 0
            ? ((round.count / totalTickets) * 100).toFixed(2)
            : '0.00'

        return (
          <div
            key={round.roundId}
            className={`lottery-ticket-card ${round.status === 'winner' ? 'winner' : ''}`}
          >
            <div className="lottery-ticket-header">
              <span className="lottery-ticket-round">
                第 {round.roundId} 轮
              </span>
              <span className={`lottery-ticket-status ${round.status}`}>
                {round.status === 'pending' && '待开奖'}
                {round.status === 'winner' && `中奖 - ${round.prizeTier}`}
                {round.status === 'loser' && '未中奖'}
              </span>
            </div>
            <div className="lottery-ticket-count">
              <span className="lottery-ticket-count-value">{round.count}</span>
              <span className="lottery-ticket-count-label">张票</span>
            </div>
            <div className="lottery-ticket-invest">
              投入: {round.count} USDT
            </div>
            <div className="lottery-ticket-prob">
              中奖概率: {round.count} / {totalTickets} = {probability}%
            </div>
            {round.status === 'winner' && round.prizeAmount && (
              <div className="lottery-ticket-prize">
                +{round.prizeAmount} USDT
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
