'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import {
  calculateNotesBackupCid,
  decryptNotesBackup,
  downloadNotesBackup,
  encryptNotesBackup,
  uploadNotesBackup,
} from '~/server/src/utils/noteBackup.js'

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

function getStatusLabel(status: BackupStatus) {
  switch (status) {
    case 'disabled':
      return '未登录'
    case 'checking':
      return '检查中'
    case 'uploading':
      return '同步中'
    case 'restoring':
      return '恢复中'
    case 'synced':
      return '已同步'
    case 'conflict':
      return '有冲突'
    case 'error':
      return '同步失败'
    default:
      return '待同步'
  }
}

export function useNoteBackupSync(): NoteBackupSyncState {
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
          '本地数据与云端不一致，本地修改将会覆盖云端数据，是否继续？'
        )
        if (!confirmed) {
          if (!silent) addToast('已取消同步', 'info')
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
        if (!silent) addToast('云端备份已更新', 'success')
        return true
      } catch (err: unknown) {
        setStatus('error')
        if (silent) {
          console.info(getErrorMessage(err, '云备份失败'))
        } else {
          addToast(getErrorMessage(err, '云备份失败'), 'error')
        }
        return false
      } finally {
        setAction(null)
      }
    },
    [addToast, requireWallet, setHasConflict]
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
          if (manual) addToast('云端暂无备份', 'info')
          return false
        }

        const cloudNotes = backup.notes || []
        const localCid = await calculateNotesBackupCid(currentNotes)
        const cloudCid =
          backup.cid || (await calculateNotesBackupCid(cloudNotes))

        if (currentNotes.length > 0 && localCid !== cloudCid) {
          const confirmed = window.confirm(
            '云端备份与本地笔记不一致。恢复会覆盖本地笔记，是否继续？'
          )
          if (!confirmed) {
            setHasConflict(true)
            setStatus('conflict')
            if (manual) addToast('已取消恢复', 'info')
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
        if (manual) addToast('已从云端恢复', 'success')
        return true
      } catch (err: unknown) {
        setStatus('error')
        if (manual) {
          addToast(getErrorMessage(err, '云端恢复失败'), 'error')
        } else {
          console.info(getErrorMessage(err, '云端恢复失败'))
        }
        return false
      } finally {
        setAction(null)
      }
    },
    [addToast, importNotes, requireWallet, setHasConflict, uploadNow]
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
      addToast('笔记已导出到本地', 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '导出失败'), 'error')
    }
  }, [addToast, requireWallet])

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
              window.confirm('恢复将覆盖当前本地笔记，是否继续？')
            if (!confirmed) {
              addToast('已取消恢复', 'info')
              return
            }
          }
          importNotes(data.notes)
          addToast('已从本地恢复笔记', 'success')
          await uploadNow({ silent: true })
        } catch (err: unknown) {
          addToast(getErrorMessage(err, '导入失败'), 'error')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [addToast, importNotes, requireWallet, uploadNow])

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

  const statusLabel = useMemo(() => getStatusLabel(status), [status])

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
