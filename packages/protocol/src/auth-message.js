/**
 * Auth message format shared by the desktop daemon and the mobile client.
 *
 * The signature contract is `timestamp:METHOD:path`, signed with EIP-191 over
 * the account wallet. Both runtimes must build the exact same message string or
 * signature verification fails.
 */
import { normalizeAddress } from './address.js'

export const AUTH_MAX_AGE_MS = 5 * 60 * 1000

export function normalizeAuthPath(path) {
  try {
    return new URL(path, 'http://most.box').pathname
  } catch {
    return String(path || '').split('?')[0] || '/'
  }
}

export function buildAuthMessage(timestamp, method, path) {
  return `${timestamp}:${String(method || 'GET').toUpperCase()}:${normalizeAuthPath(path)}`
}

export { normalizeAddress }
