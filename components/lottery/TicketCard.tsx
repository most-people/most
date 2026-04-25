'use client'

import React from 'react'
import { Ticket } from 'lucide-react'
import { useLotteryStore } from './LotteryStore'

export function TicketCard() {
  const { myTickets } = useLotteryStore()

  if (myTickets.length === 0) {
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
      {myTickets.map(ticket => (
        <div
          key={ticket.id}
          className={`lottery-ticket-card ${ticket.status === 'winner' ? 'winner' : ''}`}
        >
          <div className="lottery-ticket-header">
            <span className="lottery-ticket-round">第 {ticket.roundId} 轮</span>
            <span className={`lottery-ticket-status ${ticket.status}`}>
              {ticket.status === 'pending' && '待开奖'}
              {ticket.status === 'winner' && `中奖 - ${ticket.prizeTier}`}
              {ticket.status === 'loser' && '未中奖'}
            </span>
          </div>
          <div className="lottery-ticket-number">{ticket.number}</div>
          <div className="lottery-ticket-id">ID: {ticket.id}</div>
          {ticket.status === 'winner' && ticket.prizeAmount && (
            <div
              className="lottery-stat-value gold"
              style={{ marginTop: '8px', fontSize: '16px' }}
            >
              +{ticket.prizeAmount} USDC
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
