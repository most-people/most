import crypto from 'node:crypto'

export const USER_SYNC_SCHEMA_VERSION = 1
export const USER_SYNC_NAMESPACE_PREFIX = 'user.sync.'

const USER_SYNC_KEY_HEX_LENGTH = 64

export function normalizeUserSyncKey(input) {
  const value = String(input || '').trim().replace(/^0x/i, '').toLowerCase()
  return /^[0-9a-f]+$/.test(value) && value.length === USER_SYNC_KEY_HEX_LENGTH
    ? value
    : ''
}

export function deriveUserSyncId(syncTopicKey) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(syncTopicKey, 'hex'))
    .digest('hex')
    .slice(0, 24)
}

export function getUserSyncName(syncId) {
  return `${USER_SYNC_NAMESPACE_PREFIX}${syncId}`
}

export function getSyncTimestamp(input, fallback = Date.now()) {
  const numeric = Number(input)
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)
  const parsed = Date.parse(String(input || ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getNextSyncTimestamp(previous) {
  return Math.max(Date.now(), getSyncTimestamp(previous, 0) + 1)
}
