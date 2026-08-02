import { useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { ConfirmModal, Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import ConnectModal from '~/components/ConnectModal'
import { useAccountBackup } from '~/features/profile/useAccountBackup'
import GlobalDownloadTasks from '~/features/cid/GlobalDownloadTasks'
import { useI18n } from '~/lib/i18n'
import { migrateLegacyNoteVault } from '~/features/note/noteVaultApi'

export default function AppGlobals() {
  const { t } = useI18n()
  const pathname = useLocation({ select: location => location.pathname })
  const {
    checkCloudBackupAfterLogin,
    confirmLoginCloudRestore,
    dismissLoginCloudRestore,
    loginCloudRestorePending,
  } = useAccountBackup()
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
  const migratedVaultAddressRef = useRef('')

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
      loadUserNotes(identity.address, identity.danger)
    } else {
      resetAppState()
    }
  }, [identity?.address, identity?.danger, loadUserNotes, resetAppState])

  useEffect(() => {
    if (
      !identity ||
      hasBackend !== true ||
      notesAddress.toLowerCase() !== identityAddress.toLowerCase() ||
      typeof window === 'undefined' ||
      window.electronAPI?.isElectron !== true ||
      migratedVaultAddressRef.current === identityAddress.toLowerCase()
    ) {
      return
    }

    const address = identityAddress.toLowerCase()
    migratedVaultAddressRef.current = address
    void migrateLegacyNoteVault(identity.danger).catch(err => {
      if (migratedVaultAddressRef.current === address) {
        migratedVaultAddressRef.current = ''
      }
      console.warn('Failed to migrate legacy note vault content:', err)
    })
  }, [hasBackend, identity, identityAddress, notesAddress])

  useEffect(() => {
    if (!identityAddress || hasBackend !== true) return
    if (notesAddress.toLowerCase() !== identityAddress.toLowerCase()) return
    if (!consumePendingCloudRestore(identityAddress)) return

    void checkCloudBackupAfterLogin()
  }, [
    hasBackend,
    identityAddress,
    notesAddress,
    consumePendingCloudRestore,
    checkCloudBackupAfterLogin,
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

      <GlobalDownloadTasks />

      <UserLoginModal />

      <ConnectModal />

      {loginCloudRestorePending && (
        <ConfirmModal
          title={t('profile.backup.loginRestore.title')}
          message={t('profile.backup.loginRestore.message')}
          confirmText={t('profile.backup.action.cloudRestore')}
          onConfirm={async () => {
            await confirmLoginCloudRestore()
          }}
          onClose={dismissLoginCloudRestore}
        />
      )}
    </>
  )
}
