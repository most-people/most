import { useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'
import { getUserProfileSyncKey, startUserMetadataSync } from '~/lib/userSync'
import { getApiErrorMessage } from '~server/src/utils/api'
import { useI18n } from '~/lib/i18n'

export default function AppGlobals() {
  const { t } = useI18n()
  const pathname = useLocation({ select: location => location.pathname })
  const checkBackend = useAppStore(s => s.checkBackend)
  const hasBackend = useAppStore(s => s.hasBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const firstPath = useUserStore(s => s.firstPath)
  const initializeUser = useUserStore(s => s.initializeUser)
  const setFirstPath = useUserStore(s => s.setFirstPath)
  const identity = useUserStore(s => s.identity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const resetAppState = useAppStore(s => s.resetAppState)
  const addToast = useAppStore(s => s.addToast)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)
  const syncStartedForRef = useRef('')

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

  useEffect(() => {
    if (hasBackend !== true || !identity) {
      syncStartedForRef.current = ''
      return
    }
    const syncKey = getUserProfileSyncKey(identity)
    if (syncStartedForRef.current === syncKey) return
    syncStartedForRef.current = syncKey
    startUserMetadataSync(identity).catch(async err => {
      syncStartedForRef.current = ''
      addToast(
        await getApiErrorMessage(err, t('appGlobals.syncStartFailed')),
        'error'
      )
    })
  }, [addToast, hasBackend, identity, t])

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
