import type { UserIdentity } from '~/stores/userStore'

type AccountBackupProfile =
  | {
      displayName?: string
      avatar?: string
      updatedAt?: number
    }
  | null
  | undefined

type AccountBackupData = {
  type: string
  schemaVersion: number
  ownerAddress: string
  notes: unknown[]
  preferences?: unknown
  files?: unknown[]
  channels?: unknown[]
  noteVault?: { files: unknown[] }
}

function sortByStringField(items: unknown[] | undefined, field: string) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    String((a as Record<string, unknown>)?.[field] || '').localeCompare(
      String((b as Record<string, unknown>)?.[field] || '')
    )
  )
}

function getComparableAccountData(payload: AccountBackupData) {
  return {
    type: payload.type,
    schemaVersion: payload.schemaVersion,
    ownerAddress: payload.ownerAddress.toLowerCase(),
    notes: payload.notes,
    preferences: payload.preferences || null,
    files: sortByStringField(payload.files, 'cid'),
    channels: sortByStringField(payload.channels, 'channelKey'),
    noteVault: payload.noteVault
      ? { files: sortByStringField(payload.noteVault.files, 'path') }
      : null,
  }
}

export function hasDifferentAccountData(
  localPayload: AccountBackupData,
  backupPayload: AccountBackupData
) {
  return (
    JSON.stringify(getComparableAccountData(localPayload)) !==
    JSON.stringify(getComparableAccountData(backupPayload))
  )
}

export function shouldRestoreCloudProfile(
  identity: UserIdentity,
  profile: AccountBackupProfile
) {
  if (!profile) return false
  const localUpdatedAt = Number(identity.profileUpdatedAt)
  if (!Number.isFinite(localUpdatedAt) || localUpdatedAt <= 0) return true
  const cloudUpdatedAt = Number(profile.updatedAt)
  return Number.isFinite(cloudUpdatedAt) && cloudUpdatedAt > localUpdatedAt
}
