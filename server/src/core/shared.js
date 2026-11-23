export function normalizeAddress(value) {
  const address = String(value || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : ''
}

export function shortAddress(address) {
  const value = String(address || '')
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function normalizeAvatar(value) {
  return String(value || '')
    .trim()
    .slice(0, 4096)
}

export function normalizeDisplayName(value, fallback = '', maxLength = 50) {
  const displayName = String(value || '').trim()
  return (displayName || String(fallback || '')).slice(0, maxLength)
}
