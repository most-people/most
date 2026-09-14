import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  MessageCircle,
  NotebookPen,
  Plus,
  Search,
  Settings2,
  UserCircle,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import '~/styles/workspace.css'

export type WorkspaceTab = 'messages' | 'files' | 'notes' | 'me'

export interface WorkspaceRailItem {
  id: WorkspaceTab | string
  label: string
  icon: LucideIcon
  badge?: number
  disabled?: boolean
  onClick?: () => void
}

export interface WorkspaceShellProps {
  /** Current primary area. When omitted, the shell manages it locally. */
  activeTab?: WorkspaceTab
  defaultActiveTab?: WorkspaceTab
  onTabChange?: (tab: WorkspaceTab) => void
  /** Override the default Messages / Files / Notes / Me rail items. */
  railItems?: WorkspaceRailItem[]
  /** Content shown in the centre list column. */
  list?: ReactNode
  listTitle?: ReactNode
  listActions?: ReactNode
  /** Content shown in the right hand detail column. */
  children: ReactNode
  className?: string
  /** Controls the centre list column. */
  listCollapsed?: boolean
  defaultListCollapsed?: boolean
  onListCollapsedChange?: (collapsed: boolean) => void
  /** Optional account summary shown at the bottom of the rail. */
  account?: {
    name: string
    subtitle?: string
    avatar?: ReactNode
  }
  /** Actions rendered in the top right of the list header. */
  onSearch?: () => void
  onCreate?: () => void
  /** Mobile stack view. The list is shown by default. */
  mobileView?: 'list' | 'content'
}

const defaultRailItems: WorkspaceRailItem[] = [
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'me', label: 'Me', icon: UserCircle },
]

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

/**
 * A desktop-first workspace shell shared by files, chat, notes and settings.
 * The shell owns navigation chrome only; protocol and feature state stay with
 * the page that renders the list and content regions.
 */
export function WorkspaceShell({
  activeTab,
  defaultActiveTab = 'files',
  onTabChange,
  railItems = defaultRailItems,
  list,
  listTitle,
  listActions,
  children,
  className,
  listCollapsed,
  defaultListCollapsed = false,
  onListCollapsedChange,
  account,
  onSearch,
  onCreate,
  mobileView = 'list',
}: WorkspaceShellProps) {
  const [uncontrolledTab, setUncontrolledTab] =
    useState<WorkspaceTab>(defaultActiveTab)
  const [uncontrolledCollapsed, setUncontrolledCollapsed] =
    useState(defaultListCollapsed)
  const selectedTab = activeTab ?? uncontrolledTab
  const isListCollapsed = listCollapsed ?? uncontrolledCollapsed
  const mobileRailItems = railItems.filter(item =>
    ['messages', 'files', 'notes', 'me'].includes(item.id)
  )

  const selectTab = (tab: WorkspaceTab) => {
    if (activeTab === undefined) setUncontrolledTab(tab)
    onTabChange?.(tab)
  }

  const setListCollapsed = (collapsed: boolean) => {
    if (listCollapsed === undefined) setUncontrolledCollapsed(collapsed)
    onListCollapsedChange?.(collapsed)
  }

  return (
    <div
      className={cn(
        'workspace-shell',
        isListCollapsed && 'workspace-shell--list-collapsed',
        mobileView === 'content' && 'workspace-shell--mobile-content',
        className
      )}
      data-active-tab={selectedTab}
    >
      <nav className="workspace-shell__rail" aria-label="Workspace">
        <div className="workspace-shell__rail-items">
          {railItems.map(item => {
            const Icon = item.icon
            const isActive = item.id === selectedTab
            const isPrimaryTab = ['messages', 'files', 'notes', 'me'].includes(
              item.id
            )
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'workspace-shell__rail-item',
                  isActive && 'is-active'
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                disabled={item.disabled}
                onClick={() => {
                  if (item.onClick) {
                    item.onClick()
                  } else if (isPrimaryTab) {
                    selectTab(item.id as WorkspaceTab)
                  }
                }}
              >
                <span className="workspace-shell__rail-icon">
                  <Icon size={20} strokeWidth={isActive ? 2.25 : 1.8} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="workspace-shell__badge">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
                <span className="workspace-shell__rail-label">
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="workspace-shell__rail-bottom">
          {account && (
            <div className="workspace-shell__account" title={account.name}>
              <span className="workspace-shell__account-avatar">
                {account.avatar ?? <UserCircle size={24} />}
              </span>
              <span className="workspace-shell__account-copy">
                <strong>{account.name}</strong>
                {account.subtitle && <small>{account.subtitle}</small>}
              </span>
            </div>
          )}
          <button
            type="button"
            className="workspace-shell__rail-item workspace-shell__rail-item--utility"
            aria-label="Settings"
            onClick={() => selectTab('me')}
          >
            <span className="workspace-shell__rail-icon">
              <Settings2 size={19} />
            </span>
            <span className="workspace-shell__rail-label">Settings</span>
          </button>
        </div>
      </nav>

      <section className="workspace-shell__list-pane" aria-label="List">
        <header className="workspace-shell__list-header">
          <div className="workspace-shell__list-heading">
            {listTitle && <h1>{listTitle}</h1>}
          </div>
          <div className="workspace-shell__list-actions">
            {onSearch && (
              <button
                type="button"
                className="workspace-shell__icon-button"
                aria-label="Search"
                onClick={onSearch}
              >
                <Search size={17} />
              </button>
            )}
            {onCreate && (
              <button
                type="button"
                className="workspace-shell__icon-button"
                aria-label="Create"
                onClick={onCreate}
              >
                <Plus size={18} />
              </button>
            )}
            {listActions}
            <button
              type="button"
              className="workspace-shell__icon-button workspace-shell__collapse-button"
              aria-label={isListCollapsed ? 'Expand list' : 'Collapse list'}
              aria-expanded={!isListCollapsed}
              onClick={() => setListCollapsed(!isListCollapsed)}
            >
              {isListCollapsed ? (
                <ChevronRight size={17} />
              ) : (
                <ChevronLeft size={17} />
              )}
            </button>
          </div>
        </header>
        <div className="workspace-shell__list-scroll">{list}</div>
      </section>

      <main className="workspace-shell__content-pane">{children}</main>

      <nav className="workspace-shell__mobile-tabs" aria-label="Workspace tabs">
        {mobileRailItems.map(item => {
          const Icon = item.icon
          const isActive = item.id === selectedTab
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                'workspace-shell__mobile-tab',
                isActive && 'is-active'
              )}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (item.onClick) item.onClick()
                else selectTab(item.id as WorkspaceTab)
              }}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default WorkspaceShell
