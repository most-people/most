import { useCallback, useMemo, useState } from 'react'
import { api } from '~server/src/utils/api'
import {
  calculateNoteCid,
  normalizeNotePath,
} from '~server/src/utils/noteUtils.js'
import {
  decryptAccountBackup,
  downloadAccountBackup,
  encryptAccountBackup,
  uploadAccountBackup,
} from '~server/src/utils/accountBackup.js'
import { mostDecode } from '~server/src/utils/mostWallet.js'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore, type UserIdentity } from '~/stores/userStore'
import { isLocale, useI18n, type Locale, type MessageKey } from '~/lib/i18n'
import {
  configureNoteVault,
  getNoteVaultSnapshot,
  getNoteVaultStatus,
  restoreNoteVaultSnapshot,
  type NoteVaultSnapshot,
} from '~/features/note/noteVaultApi'

type AccountBackupAction = 'backup' | 'restore' | 'export' | 'import' | null
type AccountBackupStatus = 'idle' | 'disabled' | 'working' | 'synced' | 'error'
type AccountBackupProfile = AccountBackupPayload['profile']
type AccountBackupPreferences = AccountBackupPayload['preferences']
type AccountBackupTheme = 'dark' | 'light'
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
type AccountBackupSummary = {
  filesCount: number | null
  channelsCount: number | null
  loading: boolean
}
type BackupNoteRecord = {
  name: string
  cid: string
  path: string
  content: string
  size: number
  type: 'file'
  created_at: number
  updated_at: number
  isSecret?: boolean
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
  preferences?: {
    theme?: AccountBackupTheme
    locale?: Locale
  } | null
  files?: unknown[]
  trashFiles?: unknown[]
  channels?: unknown[]
  noteVault?: NoteVaultSnapshot
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
    payload.preferences ||
    payload.files?.length ||
    payload.channels?.length ||
    payload.noteVault?.files.length
  )
}

function hasLocalAccountContent(payload: AccountBackupPayload) {
  return Boolean(
    payload.notes.length ||
    payload.files?.length ||
    payload.channels?.length ||
    payload.noteVault?.files.length
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
    preferences: payload.preferences || null,
    files: sortByStringField(payload.files, 'cid'),
    channels: sortByStringField(payload.channels, 'channelKey'),
    noteVault: payload.noteVault
      ? {
          files: sortByStringField(payload.noteVault.files, 'path'),
        }
      : null,
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

function countBackupItems(items: unknown[] | undefined) {
  return Array.isArray(items) ? items.length : 0
}

function isDesktopNoteVaultClient() {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI?.isElectron === true &&
    typeof window.electronAPI.selectNoteVaultDirectory === 'function'
  )
}

function canSelectDesktopNoteVaultDirectory() {
  return (
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.selectNoteVaultDirectory === 'function'
  )
}

function hasNoteVaultPayload(payload: AccountBackupPayload) {
  return (
    payload.noteVault !== undefined &&
    payload.noteVault !== null &&
    Array.isArray(payload.noteVault.files)
  )
}

function ensureMarkdownFileName(input: unknown) {
  const name = String(input || '').trim()
  if (!name) return 'Untitled.md'
  return name.toLowerCase().endsWith('.md') ? name : `${name}.md`
}

function getBackupNoteContent(note: Record<string, unknown>, danger?: string) {
  const content = String(note.content || '')
  if (!danger || !content.startsWith('mp://1')) return content
  return mostDecode(content, danger) || content
}

async function readDesktopNoteVaultSnapshot() {
  try {
    const status = await getNoteVaultStatus()
    if (!status.configured) return undefined
    return await getNoteVaultSnapshot()
  } catch {
    return undefined
  }
}

async function canRestoreToDesktopNoteVault() {
  if (isDesktopNoteVaultClient()) return true

  try {
    const status = await getNoteVaultStatus()
    return status.configured
  } catch {
    return false
  }
}

async function ensureDesktopNoteVaultConfigured() {
  const status = await getNoteVaultStatus()
  if (status.configured) return true

  if (!canSelectDesktopNoteVaultDirectory()) return false
  const directory = await window.electronAPI?.selectNoteVaultDirectory?.()
  if (!directory) return false

  await configureNoteVault(directory)
  return true
}

async function createNotesFromNoteVaultSnapshot(snapshot: NoteVaultSnapshot) {
  const notes: BackupNoteRecord[] = []

  for (const file of snapshot.files) {
    const normalizedPath = normalizeNotePath(file.path)
    const lastSlash = normalizedPath.lastIndexOf('/')
    const name =
      lastSlash === -1 ? normalizedPath : normalizedPath.slice(lastSlash + 1)
    const directory = lastSlash === -1 ? '' : normalizedPath.slice(0, lastSlash)
    const content = String(file.content ?? '')
    const timestamp = Number(file.mtimeMs) || Date.now()
    notes.push({
      name: name || 'Untitled.md',
      cid: await calculateNoteCid(content),
      path: directory,
      content,
      size: Number(file.size) || new TextEncoder().encode(content).length,
      type: 'file',
      created_at: timestamp,
      updated_at: timestamp,
      isSecret: false,
    })
  }

  return notes
}

async function createNoteVaultSnapshotFromNotes(
  notesInput: unknown[],
  danger?: string
): Promise<NoteVaultSnapshot> {
  const files = new Map<string, NoteVaultSnapshot['files'][number]>()

  for (const item of notesInput) {
    if (!item || typeof item !== 'object') continue
    const note = item as Record<string, unknown>
    const name = ensureMarkdownFileName(note.name)
    const directory = normalizeNotePath(String(note.path || ''))
    const filePath = normalizeNotePath(
      directory ? `${directory}/${name}` : name
    )
    if (!filePath) continue

    const content = getBackupNoteContent(note, danger)
    const encodedSize = new TextEncoder().encode(content).length
    files.set(filePath, {
      path: filePath,
      content,
      size: Number(note.size) || encodedSize,
      mtimeMs: Number(note.updated_at) || Number(note.created_at) || Date.now(),
    })
  }

  return {
    files: [...files.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
  }
}

async function readRestoredProfile(fallback: AccountBackupProfile) {
  try {
    return await api.get<AccountBackupProfile>('/api/user/profile').json()
  } catch {
    return fallback || null
  }
}

function normalizeBackupPreferences(input: AccountBackupPreferences) {
  if (!input || typeof input !== 'object') return null
  return {
    theme:
      input.theme === 'dark' || input.theme === 'light'
        ? input.theme
        : undefined,
    locale: isLocale(input.locale) ? input.locale : undefined,
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
      Number.isFinite(updatedAt) && updatedAt > 0
        ? Math.floor(updatedAt)
        : Date.now(),
  }
}

export function useAccountBackup() {
  const { locale, setLocale, t } = useI18n()
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const notes = useAppStore(s => s.notes)
  const importNotes = useAppStore(s => s.importNotes)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const [action, setAction] = useState<AccountBackupAction>(null)
  const [status, setStatus] = useState<AccountBackupStatus>(
    wallet ? 'idle' : 'disabled'
  )
  const [backupSummary, setBackupSummary] = useState<AccountBackupSummary>({
    filesCount: null,
    channelsCount: null,
    loading: false,
  })

  const refreshBackupSummary = useCallback(async () => {
    const currentWallet = useUserStore.getState().wallet
    if (!currentWallet) {
      setBackupSummary({
        filesCount: null,
        channelsCount: null,
        loading: false,
      })
      return
    }

    setBackupSummary(summary => ({ ...summary, loading: true }))
    try {
      const metadata = await api
        .get<AccountBackupPayload>('/api/user/export')
        .json()
      setBackupSummary({
        filesCount: countBackupItems(metadata.files),
        channelsCount: countBackupItems(metadata.channels),
        loading: false,
      })
    } catch {
      setBackupSummary(summary => ({ ...summary, loading: false }))
    }
  }, [])

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
    const metadata = await api
      .get<AccountBackupPayload>('/api/user/export')
      .json()
    const currentIdentity = useUserStore.getState().identity
    const profile = currentIdentity
      ? {
          displayName: currentIdentity.displayName || currentIdentity.username,
          avatar: currentIdentity.avatar || '',
          updatedAt: Number(currentIdentity.profileUpdatedAt) || Date.now(),
        }
      : metadata.profile
    const payload: AccountBackupPayload = {
      ...metadata,
      type: 'mostbox.account-backup',
      schemaVersion: 1,
      ownerAddress: currentWallet.address.toLowerCase(),
      exportedAt: new Date().toISOString(),
      profile,
      preferences: {
        theme: useAppStore.getState().isDarkMode ? 'dark' : 'light',
        locale,
      },
      notes: useAppStore.getState().notes,
    }
    const noteVault = await readDesktopNoteVaultSnapshot()
    if (noteVault) {
      payload.noteVault = noteVault
      payload.notes = await createNotesFromNoteVaultSnapshot(noteVault)
    }
    return payload
  }, [locale, requireBackend, t])

  const restorePayload = useCallback(
    async (
      payload: AccountBackupPayload,
      options: RestorePayloadOptions = {}
    ) => {
      const currentWallet = requireWallet()
      if (!currentWallet || !requireBackend()) return false
      if (
        payload.ownerAddress.toLowerCase() !==
        currentWallet.address.toLowerCase()
      ) {
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

      let restoredNotes = payload.notes
      if (await canRestoreToDesktopNoteVault()) {
        const vaultSnapshot = hasNoteVaultPayload(payload)
          ? payload.noteVault
          : await createNoteVaultSnapshotFromNotes(
              payload.notes,
              currentWallet.danger
            )
        const shouldRestoreVault =
          hasNoteVaultPayload(payload) || Array.isArray(payload.notes)
        if (shouldRestoreVault) {
          const configured = await ensureDesktopNoteVaultConfigured()
          if (!configured) {
            addToast(t('profile.backup.toast.cancelRestore'), 'info')
            return false
          }
          await restoreNoteVaultSnapshot(vaultSnapshot)
          restoredNotes = await createNotesFromNoteVaultSnapshot(vaultSnapshot)
        }
      }

      await api
        .post<{ success: boolean }>('/api/user/import', { json: payload })
        .json()
      importNotes(restoredNotes as Parameters<typeof importNotes>[0])
      const restoredPreferences = normalizeBackupPreferences(
        payload.preferences
      )
      if (restoredPreferences?.theme) {
        setIsDarkMode(restoredPreferences.theme === 'dark')
      }
      if (restoredPreferences?.locale) {
        setLocale(restoredPreferences.locale)
      }
      const currentIdentity = useUserStore.getState().identity
      const restoredProfile = await readRestoredProfile(payload.profile)
      if (currentIdentity && restoredProfile) {
        setUserIdentity(
          applyProfileToIdentity(currentIdentity, restoredProfile)
        )
      }
      void refreshBackupSummary()
      return true
    },
    [
      addToast,
      buildPayload,
      importNotes,
      requireBackend,
      requireWallet,
      refreshBackupSummary,
      setUserIdentity,
      setIsDarkMode,
      setLocale,
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
      void refreshBackupSummary()
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
  }, [
    addToast,
    buildPayload,
    refreshBackupSummary,
    requireBackend,
    requireWallet,
    t,
  ])

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

  const importLocalBackup = useCallback(
    (options: ImportLocalBackupOptions = {}) => {
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
    },
    [addToast, requireBackend, requireWallet, restorePayload, t]
  )

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
    backupSummary,
    refreshBackupSummary,
    notesCount: notes.length,
  }
}
