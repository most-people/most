import '~/styles/portal.css'

import { Link } from '@tanstack/react-router'
import FeaturePortal from '~/components/FeaturePortal'
import { MarketingLayout } from '~/components/MarketingLayout'
import WorkspaceShell, { type WorkspaceTab } from '~/components/WorkspaceShell'
import { useI18n, type MessageKey } from '~/lib/i18n'

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

export default function HomePage() {
  const { t } = useI18n()
  return (
    <MarketingLayout>
      <div className="workspace-home">
        <WorkspaceShell
          listTitle={t('common.brand')}
          list={
            <div className="workspace-home__links">
              {(
                Object.entries(workspaceRoutes) as [WorkspaceTab, string][]
              ).map(([tab, to]) => (
                <Link key={tab} to={to} className="workspace-home__link">
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
