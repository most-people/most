export function getSyncTimestamp(input, fallback = Date.now()) {
  const numeric = Number(input)
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)
  const parsed = Date.parse(String(input || ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getNextSyncTimestamp(previous) {
  return Math.max(Date.now(), getSyncTimestamp(previous, 0) + 1)
}
