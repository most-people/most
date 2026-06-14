import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useI18n, type MessageKey } from '~/lib/i18n'
import {
  calculateNotesBackupCid,
  decryptNotesBackup,
  downloadNotesBackup,
  encryptNotesBackup,
  uploadNotesBackup,
} from '~server/src/utils/noteBackup.js'

type BackupAction = 'sync' | 'save' | 'restore' | null
type BackupStatus =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'uploading'
  | 'restoring'
  | 'synced'
  | 'conflict'
  | 'error'

interface UploadOptions {
  silent?: boolean
  confirmConflict?: boolean
}

interface RestoreOptions {
  manual?: boolean
  uploadWhenMissing?: boolean
}

export interface NoteBackupSyncState {
  action: BackupAction
  status: BackupStatus
  statusLabel: string
  hasConflict: boolean
  uploadNow: (options?: UploadOptions) => Promise<boolean>
  restoreFromCloud: (options?: RestoreOptions) => Promise<boolean>
  exportLocalBackup: () => void
  importLocalBackup: () => void
}

let noteBackupHasConflict = false
let noteBackupLastSyncedCid = ''
let noteBackupLoadedAddress = ''

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getStatusLabel(status: BackupStatus, t: (key: MessageKey) => string) {
  switch (status) {
    case 'disabled':
      return t('note.sync.status.disabled')
    case 'checking':
      return t('note.sync.status.checking')
    case 'uploading':
      return t('note.sync.status.uploading')
    case 'restoring':
      return t('note.sync.status.restoring')
    case 'synced':
      return t('note.sync.status.synced')
    case 'conflict':
      return t('note.sync.status.conflict')
    case 'error':
      return t('note.sync.status.error')
    default:
      return t('note.sync.status.idle')
  }
}

export function useNoteBackupSync(): NoteBackupSyncState {
  const { t } = useI18n()
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const addToast = useAppStore(s => s.addToast)
  const notes = useAppStore(s => s.notes)
  const importNotes = useAppStore(s => s.importNotes)
  const localDataReady = useAppStore(s => s.localDataReady)

  const [action, setAction] = useState<BackupAction>(null)
  const [status, setStatus] = useState<BackupStatus>(
    wallet ? 'idle' : 'disabled'
  )
  const [hasConflict, setHasConflictState] = useState(noteBackupHasConflict)
  const [autoUploadReady, setAutoUploadReady] = useState(false)
  const notesChangeCount = useRef(0)

  const setHasConflict = useCallback((value: boolean) => {
    noteBackupHasConflict = value
    setHasConflictState(value)
  }, [])

  const requireWallet = useCallback(
    (silent = false) => {
      const currentWallet = useUserStore.getState().wallet
      if (currentWallet) return currentWallet
      if (!silent) {
        openLoginModal()
      }
      return null
    },
    [addToast, openLoginModal]
  )

  const uploadNow = useCallback(
    async (options: UploadOptions = {}) => {
      const { silent = false, confirmConflict = true } = options
      const currentWallet = requireWallet(silent)
      if (!currentWallet) {
        setStatus('disabled')
        return false
      }

      if (noteBackupHasConflict && confirmConflict) {
        const confirmed = window.confirm(
          t('note.sync.confirm.uploadConflict')
        )
        if (!confirmed) {
          if (!silent) addToast(t('note.sync.toast.cancelSync'), 'info')
          setStatus('conflict')
          return false
        }
      }

      setAction('save')
      setStatus('uploading')
      try {
        const currentNotes = useAppStore.getState().notes
        const result = await uploadNotesBackup(currentWallet, currentNotes)
        noteBackupLastSyncedCid = result.cid
        noteBackupLoadedAddress = currentWallet.address
        setHasConflict(false)
        setStatus('synced')
        if (!silent) addToast(t('note.sync.toast.cloudUpdated'), 'success')
        return true
      } catch (err: unknown) {
        setStatus('error')
        if (silent) {
          console.info(getErrorMessage(err, t('note.sync.error.backupFailed')))
        } else {
          addToast(
            getErrorMessage(err, t('note.sync.error.backupFailed')),
            'error'
          )
        }
        return false
      } finally {
        setAction(null)
      }
    },
    [addToast, requireWallet, setHasConflict, t]
  )

  const restoreFromCloud = useCallback(
    async (options: RestoreOptions = {}) => {
      const { manual = false, uploadWhenMissing = false } = options
      const currentWallet = requireWallet(!manual)
      if (!currentWallet) {
        setStatus('disabled')
        return false
      }

      setAction(manual ? 'restore' : 'sync')
      setStatus(manual ? 'restoring' : 'checking')
      try {
        const backup = await downloadNotesBackup(currentWallet)
        const currentNotes = useAppStore.getState().notes

        if (!backup.found) {
          setHasConflict(false)
          noteBackupLoadedAddress = currentWallet.address
          if (uploadWhenMissing && currentNotes.length > 0) {
            setAction(null)
            return uploadNow({ silent: true, confirmConflict: false })
          }
          setStatus(currentNotes.length > 0 ? 'idle' : 'synced')
          if (manual) addToast(t('note.sync.toast.noCloudBackup'), 'info')
          return false
        }

        const cloudNotes = backup.notes || []
        const localCid = await calculateNotesBackupCid(currentNotes)
        const cloudCid =
          backup.cid || (await calculateNotesBackupCid(cloudNotes))

        if (currentNotes.length > 0 && localCid !== cloudCid) {
          const confirmed = window.confirm(
            t('note.sync.confirm.restoreConflict')
          )
          if (!confirmed) {
            setHasConflict(true)
            setStatus('conflict')
            if (manual) addToast(t('note.sync.toast.cancelRestore'), 'info')
            return false
          }
        }

        if (localCid !== cloudCid) {
          importNotes(cloudNotes)
        }
        noteBackupLastSyncedCid = cloudCid
        noteBackupLoadedAddress = currentWallet.address
        setHasConflict(false)
        setStatus('synced')
        if (manual) addToast(t('note.sync.toast.restoredCloud'), 'success')
        return true
      } catch (err: unknown) {
        setStatus('error')
        if (manual) {
          addToast(
            getErrorMessage(err, t('note.sync.error.restoreCloudFailed')),
            'error'
          )
        } else {
          console.info(
            getErrorMessage(err, t('note.sync.error.restoreCloudFailed'))
          )
        }
        return false
      } finally {
        setAction(null)
      }
    },
    [addToast, importNotes, requireWallet, setHasConflict, t, uploadNow]
  )

  const exportLocalBackup = useCallback(() => {
    const currentWallet = requireWallet(false)
    if (!currentWallet) return

    try {
      const currentNotes = useAppStore.getState().notes
      const encrypted = encryptNotesBackup(currentNotes, currentWallet.danger)
      const blob = new Blob([encrypted], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${currentWallet.address.slice(-4)}-most-notes-${new Date().toISOString().slice(0, 10)}.txt`
      link.click()
      URL.revokeObjectURL(url)
      addToast(t('note.sync.toast.exportedLocal'), 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, t('note.sync.error.exportFailed')), 'error')
    }
  }, [addToast, requireWallet, t])

  const importLocalBackup = useCallback(() => {
    const currentWallet = requireWallet(false)
    if (!currentWallet) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt'
    input.onchange = event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const content = reader.result as string
          const data = decryptNotesBackup(content, currentWallet.danger)
          if (useAppStore.getState().notes.length > 0) {
            const confirmed =
              window.confirm(t('note.sync.confirm.importOverwrite'))
            if (!confirmed) {
              addToast(t('note.sync.toast.cancelRestore'), 'info')
              return
            }
          }
          importNotes(data.notes)
          addToast(t('note.sync.toast.restoredLocal'), 'success')
          await uploadNow({ silent: true })
        } catch (err: unknown) {
          addToast(
            getErrorMessage(err, t('note.sync.error.importFailed')),
            'error'
          )
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [addToast, importNotes, requireWallet, t, uploadNow])

  useEffect(() => {
    if (!localDataReady) return
    if (!wallet) {
      noteBackupLoadedAddress = ''
      noteBackupLastSyncedCid = ''
      setAutoUploadReady(false)
      setHasConflict(false)
      setStatus('disabled')
      return
    }

    if (noteBackupLoadedAddress === wallet.address) {
      setAutoUploadReady(true)
      setStatus(noteBackupHasConflict ? 'conflict' : 'synced')
      return
    }

    let cancelled = false
    setAutoUploadReady(false)
    restoreFromCloud({ manual: false, uploadWhenMissing: true }).finally(() => {
      if (!cancelled) setAutoUploadReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [localDataReady, restoreFromCloud, setHasConflict, wallet])

  useEffect(() => {
    if (!wallet || !localDataReady || !autoUploadReady) return

    notesChangeCount.current += 1
    if (notesChangeCount.current <= 1) return

    const timer = window.setTimeout(async () => {
      const currentNotes = useAppStore.getState().notes
      const currentCid = await calculateNotesBackupCid(currentNotes)
      if (currentCid === noteBackupLastSyncedCid) return
      await uploadNow({ silent: true })
    }, 900)

    return () => window.clearTimeout(timer)
  }, [autoUploadReady, localDataReady, notes, uploadNow, wallet])

  const statusLabel = useMemo(() => getStatusLabel(status, t), [status, t])

  return {
    action,
    status,
    statusLabel,
    hasConflict,
    uploadNow,
    restoreFromCloud,
    exportLocalBackup,
    importLocalBackup,
  }
}
