import { useCallback, useMemo, useState } from 'react'
import { api } from '~server/src/utils/api'
import {
  decryptAccountBackup,
  downloadAccountBackup,
  encryptAccountBackup,
  uploadAccountBackup,
} from '~server/src/utils/accountBackup.js'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore, type UserIdentity } from '~/stores/userStore'
import { useI18n, type MessageKey } from '~/lib/i18n'

type AccountBackupAction = 'backup' | 'restore' | 'export' | 'import' | null
type AccountBackupStatus = 'idle' | 'disabled' | 'working' | 'synced' | 'error'
type AccountBackupProfile = AccountBackupPayload['profile']
type RestoreFromCloudOptions = {
  confirm?: boolean
  onlyWhenLocalEmpty?: boolean
  silentNoBackup?: boolean
  requestConfirm?: RestoreConfirmRequest
}
type RestoreConfirmRequest = () => boolean | Promise<boolean>
type RestorePayloadOptions = {
  confirm?: boolean
  requestConfirm?: RestoreConfirmRequest
}
type ImportLocalBackupOptions = {
  requestConfirm?: RestoreConfirmRequest
}

interface AccountBackupPayload {
  type: 'mostbox.account-backup'
  schemaVersion: 1
  ownerAddress: string
  exportedAt: string
  notes: unknown[]
  profile?: {
    displayName?: string
    avatar?: string
    updatedAt?: number
  } | null
  files?: unknown[]
  trashFiles?: unknown[]
  channels?: unknown[]
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getStatusLabel(
  status: AccountBackupStatus,
  action: AccountBackupAction,
  t: (key: MessageKey) => string
) {
  if (status === 'disabled') return t('profile.backup.status.disabled')
  if (status === 'error') return t('profile.backup.status.error')
  if (status === 'synced') return t('profile.backup.status.done')
  if (action === 'backup') return t('profile.backup.status.backingUp')
  if (action === 'restore') return t('profile.backup.status.restoring')
  if (action === 'export') return t('profile.backup.status.exporting')
  if (action === 'import') return t('profile.backup.status.importing')
  return t('profile.backup.status.idle')
}

function hasLocalData(payload: AccountBackupPayload) {
  return Boolean(
    payload.notes.length ||
      payload.profile ||
      payload.files?.length ||
      payload.trashFiles?.length ||
      payload.channels?.length
  )
}

function hasLocalAccountContent(payload: AccountBackupPayload) {
  return Boolean(
    payload.notes.length ||
    payload.files?.length ||
    payload.trashFiles?.length ||
    payload.channels?.length
  )
}

function sortByStringField(items: unknown[] | undefined, field: string) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    String((a as Record<string, unknown>)?.[field] || '').localeCompare(
      String((b as Record<string, unknown>)?.[field] || '')
    )
  )
}

function getComparablePayload(payload: AccountBackupPayload) {
  return {
    type: payload.type,
    schemaVersion: payload.schemaVersion,
    ownerAddress: payload.ownerAddress.toLowerCase(),
    notes: payload.notes,
    profile: payload.profile || null,
    files: sortByStringField(payload.files, 'cid'),
    trashFiles: sortByStringField(payload.trashFiles, 'cid'),
    channels: sortByStringField(payload.channels, 'channelKey'),
  }
}

function hasDifferentBackupData(
  localPayload: AccountBackupPayload,
  backupPayload: AccountBackupPayload
) {
  return (
    JSON.stringify(getComparablePayload(localPayload)) !==
    JSON.stringify(getComparablePayload(backupPayload))
  )
}

async function readRestoredProfile(fallback: AccountBackupProfile) {
  try {
    return await api.get<AccountBackupProfile>('/api/user/profile').json()
  } catch {
    return fallback || null
  }
}

function applyProfileToIdentity(
  identity: UserIdentity,
  profile: AccountBackupProfile
) {
  if (!profile) return identity
  const updatedAt = Number(profile.updatedAt)
  return {
    ...identity,
    displayName: profile.displayName || identity.username,
    avatar: profile.avatar || undefined,
    profileUpdatedAt:
      Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : Date.now(),
  }
}

export function useAccountBackup() {
  const { t } = useI18n()
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const notes = useAppStore(s => s.notes)
  const importNotes = useAppStore(s => s.importNotes)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const [action, setAction] = useState<AccountBackupAction>(null)
  const [status, setStatus] = useState<AccountBackupStatus>(
    wallet ? 'idle' : 'disabled'
  )

  const requireWallet = useCallback(() => {
    const currentWallet = useUserStore.getState().wallet
    if (currentWallet) return currentWallet
    openLoginModal()
    setStatus('disabled')
    return null
  }, [openLoginModal])

  const requireBackend = useCallback(() => {
    if (useAppStore.getState().hasBackend === true) return true
    openConnectModal()
    addToast(t('profile.backup.error.backendRequired'), 'error')
    return false
  }, [addToast, openConnectModal, t])

  const buildPayload = useCallback(async (): Promise<AccountBackupPayload> => {
    const currentWallet = useUserStore.getState().wallet
    if (!currentWallet) {
      throw new Error(t('profile.backup.error.loginRequired'))
    }
    if (!requireBackend()) {
      throw new Error(t('profile.backup.error.backendRequired'))
    }
    const metadata = await api.get<AccountBackupPayload>('/api/user/export').json()
    const currentIdentity = useUserStore.getState().identity
    const profile = currentIdentity
      ? {
          displayName: currentIdentity.displayName || currentIdentity.username,
          avatar: currentIdentity.avatar || '',
          updatedAt: Number(currentIdentity.profileUpdatedAt) || Date.now(),
        }
      : metadata.profile
    return {
      ...metadata,
      type: 'mostbox.account-backup',
      schemaVersion: 1,
      ownerAddress: currentWallet.address.toLowerCase(),
      exportedAt: new Date().toISOString(),
      profile,
      notes: useAppStore.getState().notes,
    }
  }, [requireBackend, t])

  const restorePayload = useCallback(
    async (payload: AccountBackupPayload, options: RestorePayloadOptions = {}) => {
      const currentWallet = requireWallet()
      if (!currentWallet || !requireBackend()) return false
      if (payload.ownerAddress.toLowerCase() !== currentWallet.address.toLowerCase()) {
        throw new Error(t('profile.backup.error.ownerMismatch'))
      }

      if (options.confirm !== false) {
        const localPayload = await buildPayload()
        if (
          hasLocalData(localPayload) &&
          hasDifferentBackupData(localPayload, payload)
        ) {
          const confirmed = options.requestConfirm
            ? await options.requestConfirm()
            : false
          if (!confirmed) {
            addToast(t('profile.backup.toast.cancelRestore'), 'info')
            return false
          }
        }
      }

      await api
        .post<{ success: boolean }>('/api/user/import', { json: payload })
        .json()
      importNotes(payload.notes as Parameters<typeof importNotes>[0])
      const currentIdentity = useUserStore.getState().identity
      const restoredProfile = await readRestoredProfile(payload.profile)
      if (currentIdentity && restoredProfile) {
        setUserIdentity(
          applyProfileToIdentity(currentIdentity, restoredProfile)
        )
      }
      return true
    },
    [
      addToast,
      buildPayload,
      importNotes,
      requireBackend,
      requireWallet,
      setUserIdentity,
      t,
    ]
  )

  const backupToCloud = useCallback(async () => {
    const currentWallet = requireWallet()
    if (!currentWallet || !requireBackend()) return false
    setAction('backup')
    setStatus('working')
    try {
      const payload = await buildPayload()
      await uploadAccountBackup(currentWallet, payload)
      setStatus('synced')
      addToast(t('profile.backup.toast.cloudUpdated'), 'success')
      return true
    } catch (err: unknown) {
      setStatus('error')
      addToast(
        getErrorMessage(err, t('profile.backup.error.backupFailed')),
        'error'
      )
      return false
    } finally {
      setAction(null)
    }
  }, [addToast, buildPayload, requireBackend, requireWallet, t])

  const restoreFromCloud = useCallback(
    async (options: RestoreFromCloudOptions = {}) => {
      const currentWallet = requireWallet()
      if (!currentWallet || !requireBackend()) return false
      setAction('restore')
      setStatus('working')
      try {
        const backup = await downloadAccountBackup(currentWallet)
        if (!backup.found || !backup.payload) {
          if (!options.silentNoBackup) {
            addToast(t('profile.backup.toast.noCloudBackup'), 'info')
          }
          setStatus('idle')
          return false
        }
        const payload = backup.payload as AccountBackupPayload
        if (options.onlyWhenLocalEmpty) {
          const localPayload = await buildPayload()
          if (
            hasLocalAccountContent(localPayload) &&
            hasDifferentBackupData(localPayload, payload)
          ) {
            setStatus('idle')
            return false
          }
        }
        const restored = await restorePayload(payload, {
          confirm: options.confirm,
          requestConfirm: options.requestConfirm,
        })
        if (restored) {
          setStatus('synced')
          addToast(t('profile.backup.toast.restoredCloud'), 'success')
        } else {
          setStatus('idle')
        }
        return restored
      } catch (err: unknown) {
        setStatus('error')
        addToast(
          getErrorMessage(err, t('profile.backup.error.restoreFailed')),
          'error'
        )
        return false
      } finally {
        setAction(null)
      }
    },
    [addToast, buildPayload, requireBackend, requireWallet, restorePayload, t]
  )

  const exportLocalBackup = useCallback(async () => {
    const currentWallet = requireWallet()
    if (!currentWallet || !requireBackend()) return
    setAction('export')
    setStatus('working')
    try {
      const payload = await buildPayload()
      const encrypted = encryptAccountBackup(payload, currentWallet.danger)
      const blob = new Blob([encrypted], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${currentWallet.address.slice(-4)}-most-account-${new Date().toISOString().slice(0, 10)}.txt`
      link.click()
      URL.revokeObjectURL(url)
      setStatus('synced')
      addToast(t('profile.backup.toast.exportedLocal'), 'success')
    } catch (err: unknown) {
      setStatus('error')
      addToast(
        getErrorMessage(err, t('profile.backup.error.exportFailed')),
        'error'
      )
    } finally {
      setAction(null)
    }
  }, [addToast, buildPayload, requireBackend, requireWallet, t])

  const importLocalBackup = useCallback((options: ImportLocalBackupOptions = {}) => {
    const currentWallet = requireWallet()
    if (!currentWallet || !requireBackend()) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt'
    input.onchange = event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = async () => {
        setAction('import')
        setStatus('working')
        try {
          const payload = decryptAccountBackup(
            String(reader.result || ''),
            currentWallet.danger
          ) as AccountBackupPayload
          const restored = await restorePayload(payload, {
            requestConfirm: options.requestConfirm,
          })
          if (restored) {
            setStatus('synced')
            addToast(t('profile.backup.toast.restoredLocal'), 'success')
          } else {
            setStatus('idle')
          }
        } catch (err: unknown) {
          setStatus('error')
          addToast(
            getErrorMessage(err, t('profile.backup.error.importFailed')),
            'error'
          )
        } finally {
          setAction(null)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [addToast, requireBackend, requireWallet, restorePayload, t])

  const effectiveStatus = wallet
    ? status === 'disabled'
      ? 'idle'
      : status
    : 'disabled'

  const statusLabel = useMemo(
    () => getStatusLabel(effectiveStatus, action, t),
    [action, effectiveStatus, t]
  )

  return {
    action,
    busy: action !== null,
    status: effectiveStatus,
    statusLabel,
    backupToCloud,
    restoreFromCloud,
    exportLocalBackup,
    importLocalBackup,
    hasBackend,
    notesCount: notes.length,
  }
}
