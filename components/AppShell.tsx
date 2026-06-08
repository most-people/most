'use client'

import React, { useState, createContext, useContext } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { Menu } from 'lucide-react'
import { useDisclosure } from '~/hooks'

interface AppShellContextValue {
  closeSidebar: () => void
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
    closeSidebar: () => void
    openSidebar: () => void
  }) => React.ReactNode
  headerTitle?: React.ReactNode
  headerRight?: React.ReactNode
  hideSidebar?: boolean
  children: React.ReactNode
}

export default function AppShell({
  sidebar,
  headerTitle,
  headerRight,
  hideSidebar = false,
  children,
}: AppShellProps) {
  const [isSidebarOpen, sidebarCtl] = useDisclosure(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

  const handleToggleSidebar = () => {
    if (hideSidebar) return
    if (isMobile) {
      sidebarCtl.toggle()
    } else {
      setIsSidebarCollapsed(!isSidebarCollapsed)
    }
  }

  const handleOpenSidebar = () => {
    if (hideSidebar) return
    if (isMobile) {
      sidebarCtl.open()
    } else {
      setIsSidebarCollapsed(false)
    }
  }

  const isSidebarVisible = hideSidebar
    ? false
    : isMobile
      ? isSidebarOpen
      : !isSidebarCollapsed

  return (
    <AppShellContext.Provider
      value={{
        closeSidebar: sidebarCtl.close,
        openSidebar: handleOpenSidebar,
        isSidebarVisible,
      }}
    >
      <div className="app-layout">
        {!hideSidebar && (
          <div
            className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`}
            onClick={() => sidebarCtl.close()}
          />
        )}

        {!hideSidebar && (
          <div
            className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}
          >
            {sidebar({
              closeSidebar: sidebarCtl.close,
              openSidebar: handleOpenSidebar,
            })}
          </div>
        )}

        <div className="main-content">
          <header className="app-header">
            <div className="header-left">
              {!hideSidebar && (
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
