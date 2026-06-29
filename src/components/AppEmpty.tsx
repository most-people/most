import type { ReactNode } from 'react'

type AppEmptyProps = {
  children: ReactNode
  className?: string
}

export function AppEmpty({ children, className = '' }: AppEmptyProps) {
  return (
    <main className={className}>
      {children}
    </main>
  )
}
