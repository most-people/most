import type { ReactNode } from 'react'

interface KeyCardProps {
  title: string
  icon: ReactNode
  children: ReactNode
  accent?: boolean
}

export function KeyCard({
  title,
  icon,
  children,
  accent = false,
}: KeyCardProps) {
  return (
    <div className={`web3-key-card ${accent ? 'accent' : ''}`}>
      <div className="web3-key-card-header">
        <span className="web3-key-card-icon">{icon}</span>
        <span className="web3-key-card-title">{title}</span>
      </div>
      <div className="web3-key-card-body" translate="no">
        {children}
      </div>
    </div>
  )
}
