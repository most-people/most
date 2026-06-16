import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore, type UserIdentity } from '~/stores/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'
import {
  getUserProfileSyncKey,
  reconcileUserProfileSync,
  refreshJoinedChannelProfiles,
  startUserMetadataSync,
} from '~/lib/userSync'
import {
  getApiErrorMessage,
  getAuthenticatedWebSocketUrl,
} from '~server/src/utils/api'
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
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const resetAppState = useAppStore(s => s.resetAppState)
  const addToast = useAppStore(s => s.addToast)
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)
  const syncStartedForRef = useRef('')
  const identityRef = useRef(identity)

  useEffect(() => {
    identityRef.current = identity
  }, [identity])

  const reconcileProfile = useCallback(
    async (currentIdentity: UserIdentity) => {
      const result = await reconcileUserProfileSync(currentIdentity)
      if (result.restoredIdentity) {
        setUserIdentity(result.restoredIdentity)
        await refreshJoinedChannelProfiles(result.restoredIdentity)
        return
      }
      if (result.pushed) {
        await refreshJoinedChannelProfiles(currentIdentity)
      }
    },
    [setUserIdentity]
  )

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
    startUserMetadataSync(identity)
      .then(() => reconcileProfile(identity))
      .catch(async err => {
        syncStartedForRef.current = ''
        addToast(
          await getApiErrorMessage(err, t('appGlobals.syncStartFailed')),
          'error'
        )
      })
  }, [addToast, hasBackend, identity, reconcileProfile, t])

  useEffect(() => {
    if (hasBackend !== true || !identity) return
    let closed = false
    let ws: WebSocket | null = null

    async function connectProfileEvents() {
      ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (closed) {
        ws.close()
        return
      }
      ws.onmessage = event => {
        try {
          const payload = JSON.parse(event.data)
          const ownerAddress = String(
            payload.data?.ownerAddress || ''
          ).toLowerCase()
          const currentIdentity = identityRef.current
          if (
            payload.event === 'user:metadata:updated' &&
            payload.data?.scope === 'profile' &&
            currentIdentity &&
            ownerAddress === currentIdentity.address.toLowerCase()
          ) {
            reconcileProfile(currentIdentity).catch(async err => {
              addToast(
                await getApiErrorMessage(err, t('appGlobals.syncStartFailed')),
                'error'
              )
            })
          }
        } catch {}
      }
      ws.onerror = () => ws?.close()
    }

    void connectProfileEvents().catch(async err => {
      addToast(
        await getApiErrorMessage(err, t('appGlobals.syncStartFailed')),
        'error'
      )
    })

    return () => {
      closed = true
      ws?.close()
    }
  }, [addToast, hasBackend, identity?.address, reconcileProfile, t])

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
