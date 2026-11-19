import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

type ProfileCollapsibleProps = {
  title: string
  children: ReactNode
}

export function ProfileCollapsible({
  title,
  children,
}: ProfileCollapsibleProps) {
  return (
    <details className="profile-card profile-collapsible ui-glass-surface">
      <summary className="profile-row">
        <div className="profile-row-text">
          <h3>{title}</h3>
        </div>
        <ChevronRight size={16} className="profile-collapsible-chevron" />
      </summary>
      <div className="profile-collapsible-body">{children}</div>
    </details>
  )
}
