import type { UserIdentity } from '~/stores/userStore'
import { calculateNoteCid } from '~server/src/utils/noteUtils.js'

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

function normalizeCidValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCidValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeCidValue(entry)])
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

async function getAccountDataCid(payload: AccountBackupData) {
  return calculateNoteCid(
    JSON.stringify(normalizeCidValue(getComparableAccountData(payload)))
  )
}

export async function hasDifferentAccountData(
  localPayload: AccountBackupData,
  backupPayload: AccountBackupData
) {
  const [localCid, backupCid] = await Promise.all([
    getAccountDataCid(localPayload),
    getAccountDataCid(backupPayload),
  ])
  return localCid !== backupCid
}

export function shouldRestoreCloudProfile(
  identity: UserIdentity,
  profile: AccountBackupProfile
) {
  if (!profile) return false
  const cloudUpdatedAt = Number(profile.updatedAt)
  if (!Number.isFinite(cloudUpdatedAt) || cloudUpdatedAt <= 0) return false
  const localUpdatedAt = Number(identity.profileUpdatedAt)
  if (!Number.isFinite(localUpdatedAt) || localUpdatedAt <= 0) return true
  return cloudUpdatedAt > localUpdatedAt
}
