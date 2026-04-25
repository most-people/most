'use client'

import React from 'react'

const prizeTiers = [
  { icon: '🥇', name: '一等奖', percent: 50, desc: '1 名独享' },
  { icon: '🥈', name: '二等奖', percent: 10, desc: '1 名独享' },
  { icon: '🥉', name: '三等奖', percent: 5, desc: '1 名独享' },
  { icon: '🎫', name: '参与奖', percent: 35, desc: '未中奖者平分' },
]

export function PrizeTier() {
  return (
    <div className="lottery-prize-tier">
      <div className="lottery-prize-title">奖项分配</div>
      <div className="lottery-prize-list">
        {prizeTiers.map(tier => (
          <div key={tier.name} className="lottery-prize-item">
            <div className="lottery-prize-left">
              <span className="lottery-prize-icon">{tier.icon}</span>
              <div>
                <span className="lottery-prize-name">{tier.name}</span>
                <span className="lottery-prize-desc">{tier.desc}</span>
              </div>
            </div>
            <span className="lottery-prize-percent">{tier.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
