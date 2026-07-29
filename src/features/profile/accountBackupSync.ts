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

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeFile(value: unknown) {
  const file = asRecord(value)
  const isCollection = file.kind === 'collection'
  return {
    cid: String(file.cid || ''),
    fileName: String(file.fileName || ''),
    size: Number(file.size) || 0,
    publishedAt: String(file.publishedAt || ''),
    starred: file.starred === true,
    kind: isCollection ? 'collection' : '',
    fileCount: isCollection ? Number(file.fileCount) || 0 : 0,
  }
}

function normalizeChannel(value: unknown) {
  const channel = asRecord(value)
  return {
    channelId: String(channel.channelId || ''),
    channelKey: String(channel.channelKey || ''),
    type: String(channel.type || 'personal'),
    remark: String(channel.remark || ''),
    pinned: channel.pinned === true,
  }
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

function getComparableOverwriteData(payload: AccountBackupData) {
  return {
    type: payload.type,
    schemaVersion: payload.schemaVersion,
    ownerAddress: payload.ownerAddress.toLowerCase(),
    notes: payload.notes,
    preferences: payload.preferences || null,
    noteVault: payload.noteVault
      ? { files: sortByStringField(payload.noteVault.files, 'path') }
      : null,
  }
}

async function getOverwriteDataCid(payload: AccountBackupData) {
  return calculateNoteCid(
    JSON.stringify(normalizeCidValue(getComparableOverwriteData(payload)))
  )
}

function getRecordUpdatedAt(value: unknown) {
  const record = asRecord(value)
  const input =
    record.updatedAt ||
    record.syncUpdatedAt ||
    record.publishedAt ||
    record.createdAt
  const numeric = Number(input)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = Date.parse(String(input || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function hasRestorableRecordChanges(
  localItems: unknown[] | undefined,
  backupItems: unknown[] | undefined,
  keyField: string,
  normalize: (value: unknown) => unknown
) {
  const localByKey = new Map(
    (Array.isArray(localItems) ? localItems : []).map(item => [
      String(asRecord(item)[keyField] || ''),
      item,
    ])
  )

  return (Array.isArray(backupItems) ? backupItems : []).some(backupItem => {
    const key = String(asRecord(backupItem)[keyField] || '')
    if (!key) return false
    const localItem = localByKey.get(key)
    if (!localItem) return true
    if (getRecordUpdatedAt(backupItem) <= getRecordUpdatedAt(localItem)) {
      return false
    }
    return (
      JSON.stringify(normalizeCidValue(normalize(localItem))) !==
      JSON.stringify(normalizeCidValue(normalize(backupItem)))
    )
  })
}

export async function hasDifferentAccountData(
  localPayload: AccountBackupData,
  backupPayload: AccountBackupData
) {
  const [localCid, backupCid] = await Promise.all([
    getOverwriteDataCid(localPayload),
    getOverwriteDataCid(backupPayload),
  ])
  if (localCid !== backupCid) return true

  return (
    hasRestorableRecordChanges(
      localPayload.files,
      backupPayload.files,
      'cid',
      normalizeFile
    ) ||
    hasRestorableRecordChanges(
      localPayload.channels,
      backupPayload.channels,
      'channelKey',
      normalizeChannel
    )
  )
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
