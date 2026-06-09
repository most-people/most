'use client'

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { Menu } from 'lucide-react'
import { useDisclosure } from '~/hooks'

type CloseSidebarOptions = {
  collapse?: boolean
}

type CloseSidebar = (options?: CloseSidebarOptions) => void

interface AppShellContextValue {
  closeSidebar: CloseSidebar
  openSidebar: () => void
  isSidebarVisible: boolean
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell() {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShell')
  return ctx
}

interface AppShellProps {
  sidebar: (helpers: {
    closeSidebar: CloseSidebar
    openSidebar: () => void
  }) => React.ReactNode
  className?: string
  headerTitle?: React.ReactNode
  headerRight?: React.ReactNode
  sidebarToggleReplacement?: React.ReactNode
  defaultHide?: boolean
  children: React.ReactNode
}

export default function AppShell({
  sidebar,
  className = '',
  headerTitle,
  headerRight,
  sidebarToggleReplacement,
  defaultHide = false,
  children,
}: AppShellProps) {
  const [isSidebarOpen, sidebarCtl] = useDisclosure(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(defaultHide)
  const previousDefaultHideRef = useRef(defaultHide)
  const isMobile = useMediaQuery('(max-width: 768px)')

  const handleCloseSidebar = useCallback<CloseSidebar>(
    (options = {}) => {
      sidebarCtl.close()
      if (options.collapse) {
        setIsSidebarCollapsed(true)
      }
    },
    [sidebarCtl]
  )

  useEffect(() => {
    if (defaultHide === previousDefaultHideRef.current) return
    if (defaultHide) {
      handleCloseSidebar({ collapse: true })
    } else {
      setIsSidebarCollapsed(false)
    }
    previousDefaultHideRef.current = defaultHide
  }, [defaultHide, handleCloseSidebar])

  const handleToggleSidebar = () => {
    if (isMobile) {
      sidebarCtl.toggle()
    } else {
      setIsSidebarCollapsed(!isSidebarCollapsed)
    }
  }

  const handleOpenSidebar = () => {
    if (isMobile) {
      sidebarCtl.open()
    } else {
      setIsSidebarCollapsed(false)
    }
  }

  const isSidebarVisible = isMobile ? isSidebarOpen : !isSidebarCollapsed

  return (
    <AppShellContext.Provider
      value={{
        closeSidebar: handleCloseSidebar,
        openSidebar: handleOpenSidebar,
        isSidebarVisible,
      }}
    >
      <div className={['app-layout', className].filter(Boolean).join(' ')}>
        <div
          className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`}
          onClick={() => handleCloseSidebar()}
        />

        <div
          className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}
        >
          {sidebar({
            closeSidebar: handleCloseSidebar,
            openSidebar: handleOpenSidebar,
          })}
        </div>

        <div className="main-content">
          <header className="app-header">
            <div className="header-left">
              {sidebarToggleReplacement ?? (
                <button
                  onClick={handleToggleSidebar}
                  className="btn btn-icon sidebar-toggle-btn"
                  aria-label={
                    isMobile
                      ? '打开菜单'
                      : isSidebarCollapsed
                        ? '展开侧边栏'
                        : '收起侧边栏'
                  }
                >
                  <Menu size={16} />
                </button>
              )}
              {headerTitle}
            </div>
            <div className="header-right">{headerRight}</div>
          </header>

          {children}
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
