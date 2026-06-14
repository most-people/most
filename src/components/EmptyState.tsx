import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  message: string
  className?: string
}

export function EmptyState({
  icon,
  message,
  className = 'empty-state glass',
}: EmptyStateProps) {
  return (
    <div className={className}>
      <div className="empty-state-icon">{icon}</div>
      <p>{message}</p>
    </div>
  )
}
