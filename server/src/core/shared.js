export function normalizeAddress(value) {
  const address = String(value || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : ''
}

export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
}

export function normalizeAvatar(value) {
  return String(value || '').trim().slice(0, 4096)
}

export function normalizeDisplayName(value, fallback = '', maxLength = 50) {
  const displayName = String(value || '').trim()
  return (displayName || String(fallback || '')).slice(0, maxLength)
}

export function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

export function createEventId(prefix) {
  return `${prefix}_${Date.now()}_${randomHex(4)}`
}

export function randomInt(max) {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1)
    globalThis.crypto.getRandomValues(value)
    return value[0] % max
  }
  return Math.floor(Math.random() * max)
}

export function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
