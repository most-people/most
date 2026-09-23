import { useCallback, useMemo, useState } from 'react'
import { api } from '~server/src/utils/api'
import {
  decryptAccountBackup,
  encryptAccountBackup,
} from '~server/src/utils/accountBackup.js'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore, type UserIdentity } from '~/stores/userStore'
import { isLocale, useI18n, type Locale, type MessageKey } from '~/lib/i18n'
import { normalizeLocalizedTag, type LocalizedTag } from '~/lib/localizedTag'
import {
  isAppearancePreference,
  type AppearancePreference,
} from '~/lib/appearance'
type AccountBackupAction = 'export' | 'import' | null
type AccountBackupStatus = 'idle' | 'disabled' | 'working' | 'synced' | 'error'
type AccountBackupProfile = AccountBackupPayload['profile']
type AccountBackupPreferences = AccountBackupPayload['preferences']
type AccountBackupTheme = AppearancePreference
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

interface AccountBackupPayload {
  type: 'mostbox.account-backup'
  schemaVersion: number
  ownerAddress: string
  exportedAt: string
  profile?: {
    displayName?: string
    avatar?: string
    tag?: LocalizedTag | null
    updatedAt?: number
  } | null
  preferences?: {
    theme?: AccountBackupTheme
    locale?: Locale
  } | null
  files?: unknown[]
  trashFiles?: unknown[]
  channels?: unknown[]
  notes?: unknown[]
  noteVault?: unknown
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
  if (action === 'export') return t('profile.backup.status.exporting')
  if (action === 'import') return t('profile.backup.status.importing')
  return t('profile.backup.status.idle')
}

function hasLocalData(payload: AccountBackupPayload) {
  return Boolean(
    payload.profile ||
    payload.preferences ||
    payload.files?.length ||
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
    profile: payload.profile || null,
    preferences: payload.preferences || null,
    files: sortByStringField(payload.files, 'cid'),
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

function countBackupItems(items: unknown[] | undefined) {
  return Array.isArray(items) ? items.length : 0
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
    theme: isAppearancePreference(input.theme) ? input.theme : undefined,
    locale: isLocale(input.locale) ? input.locale : undefined,
  }
}

function applyProfileToIdentity(
  identity: UserIdentity,
  profile: AccountBackupProfile
) {
  if (!profile) return identity
  const updatedAt = Number(profile.updatedAt)
  const hasTag = Object.prototype.hasOwnProperty.call(profile, 'tag')
  const normalizedTag =
    profile.tag === null ? null : normalizeLocalizedTag(profile.tag)
  return {
    ...identity,
    displayName: profile.displayName || identity.username,
    avatar: profile.avatar || undefined,
    ...(hasTag && (profile.tag === null || normalizedTag)
      ? { tag: normalizedTag }
      : {}),
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
  const setAppearance = useAppStore(s => s.setAppearance)
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
          tag: currentIdentity.tag,
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
        theme: useAppStore.getState().appearance,
        locale,
      },
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

      const migratedPayload: AccountBackupPayload = { ...payload }
      delete migratedPayload.notes
      delete migratedPayload.noteVault

      if (options.confirm !== false) {
        const localPayload = await buildPayload()
        if (
          hasLocalData(localPayload) &&
          hasDifferentBackupData(localPayload, migratedPayload)
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
        .post<{ success: boolean }>('/api/user/import', {
          json: migratedPayload,
        })
        .json()
      const restoredPreferences = normalizeBackupPreferences(
        migratedPayload.preferences
      )
      if (restoredPreferences?.theme) {
        setAppearance(restoredPreferences.theme)
      }
      if (restoredPreferences?.locale) {
        setLocale(restoredPreferences.locale)
      }
      const currentIdentity = useUserStore.getState().identity
      const restoredProfile = await readRestoredProfile(migratedPayload.profile)
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
      requireBackend,
      requireWallet,
      refreshBackupSummary,
      setUserIdentity,
      setAppearance,
      setLocale,
      t,
    ]
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
    exportLocalBackup,
    importLocalBackup,
    hasBackend,
    backupSummary,
    refreshBackupSummary,
  }
}
