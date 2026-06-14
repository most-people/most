import { useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'
import { startUserMetadataSync } from '~/lib/userSync'
import { getApiErrorMessage } from '~/server/src/utils/api'
import { useI18n } from '~/lib/i18n'

export default function AppGlobals() {
  const { t } = useI18n()
  const pathname = useLocation({ select: location => location.pathname })
  const isDemoPage = pathname === '/demo' || pathname.startsWith('/demo/')
  const checkBackend = useAppStore(s => s.checkBackend)
  const hasBackend = useAppStore(s => s.hasBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const initializeUser = useUserStore(s => s.initializeUser)
  const identity = useUserStore(s => s.identity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const resetAppState = useAppStore(s => s.resetAppState)
  const addToast = useAppStore(s => s.addToast)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)
  const syncStartedForRef = useRef('')

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

  useEffect(() => {
    if (isDemoPage || hasBackend !== true || !identity) {
      syncStartedForRef.current = ''
      return
    }
    const syncKey = identity.address.toLowerCase()
    if (syncStartedForRef.current === syncKey) return
    syncStartedForRef.current = syncKey
    startUserMetadataSync(identity).catch(async err => {
      syncStartedForRef.current = ''
      addToast(
        await getApiErrorMessage(err, t('appGlobals.syncStartFailed')),
        'error'
      )
    })
  }, [addToast, hasBackend, identity, identity?.address, isDemoPage, t])

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
