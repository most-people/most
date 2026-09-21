/**
 * Address helpers shared by the account model and the auth message format.
 *
 * Copied verbatim from `server/src/core/shared.js` so both runtimes agree on
 * what counts as a normalized owner address.
 */
export function normalizeAddress(value) {
  const address = String(value || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : ''
}

export function shortAddress(address) {
  const value = String(address || '')
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}
