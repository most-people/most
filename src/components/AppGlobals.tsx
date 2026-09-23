import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'
import GlobalDownloadTasks from '~/features/cid/GlobalDownloadTasks'
import { cleanupLegacyKnowledgeData } from '~/lib/legacyKnowledgeCleanup'

export default function AppGlobals() {
  const pathname = useLocation({ select: location => location.pathname })
  const checkBackend = useAppStore(s => s.checkBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const firstPath = useUserStore(s => s.firstPath)
  const initializeUser = useUserStore(s => s.initializeUser)
  const setFirstPath = useUserStore(s => s.setFirstPath)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)

  useEffect(() => {
    void cleanupLegacyKnowledgeData().catch(error => {
      console.warn('[legacy-cleanup] failed:', error)
    })
    initializeLocalData()
    initializeUser()
    checkBackend()
  }, [checkBackend, initializeLocalData, initializeUser])

  useEffect(() => {
    if (firstPath) return
    setFirstPath(pathname || '/')
  }, [firstPath, pathname, setFirstPath])

  return (
    <>
      {toasts.map((t, i) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          onDone={() => removeToast(t.id)}
          index={i}
        />
      ))}

      <GlobalDownloadTasks />

      <UserLoginModal />

      <ConnectModal />
    </>
  )
}
