'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'

export default function AppGlobals() {
  const pathname = usePathname()
  const isDemoPage = pathname === '/demo' || pathname.startsWith('/demo/')
  const checkBackend = useAppStore(s => s.checkBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const initializeUser = useUserStore(s => s.initializeUser)
  const identity = useUserStore(s => s.identity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const resetAppState = useAppStore(s => s.resetAppState)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)

  useEffect(() => {
    if (isDemoPage) return

    initializeLocalData()
    initializeUser()
    checkBackend()
  }, [checkBackend, initializeLocalData, initializeUser, isDemoPage])

  useEffect(() => {
    if (isDemoPage) return

    if (identity) {
      loadUserNotes(identity.address)
    } else {
      resetAppState()
    }
  }, [identity?.address, isDemoPage, loadUserNotes, resetAppState])

  if (isDemoPage) return null

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
