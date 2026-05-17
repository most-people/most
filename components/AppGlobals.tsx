'use client'

import { useEffect } from 'react'
import { useAppStore } from '~/app/app/useAppStore'
import { Toast } from '~/components/ui'
import SettingsDrawer from '~/components/SettingsDrawer'

export default function AppGlobals() {
  const checkBackend = useAppStore(s => s.checkBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)
  const showSettings = useAppStore(s => s.showSettings)
  const closeSettings = useAppStore(s => s.closeSettings)

  useEffect(() => {
    initializeLocalData()
    checkBackend()
  }, [checkBackend, initializeLocalData])

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

      {showSettings && (
        <SettingsDrawer onClose={closeSettings} />
      )}
    </>
  )
}
