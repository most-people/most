export const DEFAULT_OWNER_BUCKET = '__local__'

export function normalizeOwnerAddress(address) {
  const value = String(address || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : ''
}

export function getOwnerBucketKey(address) {
  return normalizeOwnerAddress(address) || DEFAULT_OWNER_BUCKET
}

export function normalizeMetadataBuckets(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  const buckets = {}
  for (const [rawOwner, records] of Object.entries(input)) {
    const ownerKey =
      rawOwner === DEFAULT_OWNER_BUCKET
        ? DEFAULT_OWNER_BUCKET
        : normalizeOwnerAddress(rawOwner)
    if (!ownerKey || !Array.isArray(records)) continue
    buckets[ownerKey] = records.map(record => ({ ...record }))
  }
  return buckets
}

export function cloneMetadataRecord(record, ownerAddress = '') {
  return {
    ...record,
    ownerAddress:
      ownerAddress && ownerAddress !== DEFAULT_OWNER_BUCKET ? ownerAddress : '',
  }
}
