'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import SettingsDrawer from '../../components/SettingsDrawer'
import { Toast } from '../../components/ui'
import { useDisclosure } from '../../hooks'
import {
  api,
  getBackendUrlExport,
  detectSameOriginBackend,
  detectLocalhostBackend,
  setBackendUrl,
} from '../../server/src/utils/api'

interface ToastItem {
  id: number
  message: string
  type: string
}

interface AppContextValue {
  isDarkMode: boolean
  setIsDarkMode: (v: boolean) => void
  openSettings: () => void
  closeSettings: () => void
  addToast: (message: string, type?: string) => void
  showBackendWarning: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export default function AppProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [showSettings, { open: openSettings, close: closeSettings }] =
    useDisclosure(false)
  const [showBackendWarning, setShowBackendWarning] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type = 'info') => {
    setToasts(prev => [...prev, { id: Date.now(), message, type }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleShutdown = useCallback(() => {
    if (typeof window === 'undefined') return
    const confirmed = window.confirm('确定要关闭服务吗？')
    if (confirmed) {
      api.post('/api/shutdown').catch(() => {})
      window.close()
    }
  }, [])

  // Theme initialization
  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem('theme') : null
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    if (saved === 'dark' || (!saved && prefersDark)) {
      setIsDarkMode(true)
    }
  }, [])

  // Theme application
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      isDarkMode ? 'dark' : 'light'
    )
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  // Backend warning detection (initial)
  useEffect(() => {
    if (!getBackendUrlExport()) {
      detectSameOriginBackend().then(detected => {
        if (!detected) {
          detectLocalhostBackend().then(localDetected => {
            if (!localDetected) setShowBackendWarning(true)
          })
        }
      })
    }
  }, [])

  // Backend warning polling
  useEffect(() => {
    if (!showBackendWarning) return
    const interval = setInterval(() => {
      detectSameOriginBackend().then(detected => {
        if (detected) {
          setBackendUrl('')
          setShowBackendWarning(false)
          return
        }
        detectLocalhostBackend().then(localDetected => {
          if (localDetected) {
            setBackendUrl('http://localhost:1976')
            setShowBackendWarning(false)
          }
        })
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [showBackendWarning])

  return (
    <AppContext.Provider
      value={{
        isDarkMode,
        setIsDarkMode,
        openSettings,
        closeSettings,
        addToast,
        showBackendWarning,
      }}
    >
      {children}

      {toasts.map((t, i) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          onDone={() => removeToast(t.id)}
          index={i}
        />
      ))}

      {showSettings && (
        <SettingsDrawer
          onClose={closeSettings}
          addToast={addToast}
          isDarkMode={isDarkMode}
          handleShutdown={handleShutdown}
        />
      )}
    </AppContext.Provider>
  )
}
