import '~/styles/portal.css'

import { Link, useNavigate } from '@tanstack/react-router'
import {
  FolderOpen,
  MessageCircle,
  NotebookPen,
  UserCircle,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import FeaturePortal from '~/components/FeaturePortal'
import { MarketingLayout } from '~/components/MarketingLayout'
import WorkspaceShell, { type WorkspaceTab } from '~/components/WorkspaceShell'
import { useI18n, type MessageKey } from '~/lib/i18n'
import { useWorkspaceStore } from '~/stores/useWorkspaceStore'

const workspaceRoutes: Record<WorkspaceTab, string> = {
  messages: '/chat/',
  files: '/file/',
  notes: '/note/',
  me: '/admin/',
}

const workspaceLabels: Record<WorkspaceTab, MessageKey> = {
  messages: 'workspace.messages',
  files: 'workspace.files',
  notes: 'workspace.notes',
  me: 'workspace.me',
}

const workspaceIcons = {
  messages: MessageCircle,
  files: FolderOpen,
  notes: NotebookPen,
  me: UserCircle,
} satisfies Record<WorkspaceTab, typeof MessageCircle>

export default function HomePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const activeTab = useWorkspaceStore(state => state.activeTab)
  const lastRoute = useWorkspaceStore(state => state.lastRoute)
  const setActiveTab = useWorkspaceStore(state => state.setActiveTab)
  const setLastRoute = useWorkspaceStore(state => state.setLastRoute)
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (!lastRoute || lastRoute === '/') return
    const route = Object.values(workspaceRoutes).find(
      candidate => lastRoute === candidate || lastRoute.startsWith(candidate)
    )
    if (route) {
      navigate({ to: route })
    }
  }, [lastRoute, navigate])

  const handleTabChange = (tab: WorkspaceTab) => {
    const route = workspaceRoutes[tab]
    setActiveTab(tab)
    setLastRoute(route)
    navigate({ to: route })
  }

  return (
    <MarketingLayout>
      <div className="workspace-home">
        <WorkspaceShell
          activeTab={activeTab}
          onTabChange={handleTabChange}
          listTitle={t('common.brand')}
          list={
            <div className="workspace-home__links">
              {(
                Object.entries(workspaceRoutes) as [WorkspaceTab, string][]
              ).map(([tab, to]) => (
                <Link
                  key={tab}
                  to={to}
                  className={`workspace-home__link ${
                    activeTab === tab ? 'is-active' : ''
                  }`}
                  aria-current={activeTab === tab ? 'page' : undefined}
                  onClick={() => {
                    setActiveTab(tab)
                    setLastRoute(to)
                  }}
                >
                  <span
                    className="workspace-home__link-icon"
                    aria-hidden="true"
                  >
                    {(() => {
                      const Icon = workspaceIcons[tab]
                      return <Icon size={18} />
                    })()}
                  </span>
                  <span>{t(workspaceLabels[tab])}</span>
                </Link>
              ))}
            </div>
          }
        >
          <FeaturePortal />
        </WorkspaceShell>
      </div>
    </MarketingLayout>
  )
}
