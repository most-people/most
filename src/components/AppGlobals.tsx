import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'
import { useAccountBackup } from '~/features/profile/useAccountBackup'

export default function AppGlobals() {
  const pathname = useLocation({ select: location => location.pathname })
  const { restoreFromCloud } = useAccountBackup()
  const checkBackend = useAppStore(s => s.checkBackend)
  const hasBackend = useAppStore(s => s.hasBackend)
  const initializeLocalData = useAppStore(s => s.initializeLocalData)
  const firstPath = useUserStore(s => s.firstPath)
  const initializeUser = useUserStore(s => s.initializeUser)
  const setFirstPath = useUserStore(s => s.setFirstPath)
  const identity = useUserStore(s => s.identity)
  const loadUserNotes = useAppStore(s => s.loadUserNotes)
  const notesAddress = useAppStore(s => s.notesAddress)
  const resetAppState = useAppStore(s => s.resetAppState)
  const consumePendingCloudRestore = useUserStore(
    s => s.consumePendingCloudRestore
  )
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)
  const identityAddress = identity?.address || ''

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
    if (!identityAddress || hasBackend !== true) return
    if (notesAddress.toLowerCase() !== identityAddress.toLowerCase()) return
    if (!consumePendingCloudRestore(identityAddress)) return

    void restoreFromCloud({
      confirm: false,
      onlyWhenLocalEmpty: true,
      silentNoBackup: true,
    })
  }, [
    hasBackend,
    identityAddress,
    notesAddress,
    consumePendingCloudRestore,
    restoreFromCloud,
  ])

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
