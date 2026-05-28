'use client'

import { useEffect } from 'react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { Toast } from '~/components/ui'
import SettingsDrawer from '~/components/SettingsDrawer'
import UserLoginModal from '~/components/UserLoginModal'

export default function AppGlobals() {
  const checkBackend = useAppStore(s => s.checkBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const initializeUser = useUserStore(s => s.initializeUser)
  const identity = useUserStore(s => s.identity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const resetAppState = useAppStore(s => s.resetAppState)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)
  const showSettings = useAppStore(s => s.showSettings)
  const closeSettings = useAppStore(s => s.closeSettings)

  useEffect(() => {
    initializeLocalData()
    initializeUser()
    checkBackend()
  }, [checkBackend, initializeLocalData, initializeUser])

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

      {showSettings && <SettingsDrawer onClose={closeSettings} />}

      <UserLoginModal />
    </>
  )
}
