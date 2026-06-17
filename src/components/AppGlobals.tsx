import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'

export default function AppGlobals() {
  const pathname = useLocation({ select: location => location.pathname })
  const checkBackend = useAppStore(s => s.checkBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const firstPath = useUserStore(s => s.firstPath)
  const initializeUser = useUserStore(s => s.initializeUser)
  const setFirstPath = useUserStore(s => s.setFirstPath)
  const identity = useUserStore(s => s.identity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const resetAppState = useAppStore(s => s.resetAppState)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)

  useEffect(() => {
    initializeLocalData()
    initializeUser()
    checkBackend()
  }, [checkBackend, initializeLocalData, initializeUser])

  useEffect(() => {
    if (firstPath) return
    setFirstPath(pathname || '/')
  }, [firstPath, pathname, setFirstPath])

  useEffect(() => {
    if (identity) {
      loadUserNotes(identity.address)
    } else {
      resetAppState()
    }
  }, [identity?.address, loadUserNotes, resetAppState])

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

      <UserLoginModal />

      <ConnectModal />
    </>
  )
}
