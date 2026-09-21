/**
 * HTTP request authentication.
 *
 * The signed message format lives in `@most-box/protocol` because the mobile
 * client must build the exact same string. This module keeps the daemon-side
 * verification and header construction.
 */
import { verifyMessage } from 'ethers'
import { AUTH_MAX_AGE_MS as SHARED_AUTH_MAX_AGE_MS } from '@most-box/protocol'
import {
  buildAuthMessage,
  normalizeAddress,
  normalizeAuthPath,
} from '@most-box/protocol'

import { mostSignMessage } from './mostWallet.js'

export const AUTH_MAX_AGE_MS = SHARED_AUTH_MAX_AGE_MS
export { normalizeAddress }

export { buildAuthMessage, normalizeAuthPath }

export async function buildAuthHeaders(identity, method, path) {
  if (!identity?.danger) return {}
  const timestamp = Date.now().toString()
  const message = buildAuthMessage(timestamp, method, path)
  const { address, signature } = await mostSignMessage(identity.danger, message)
  return {
    Authorization: `${address},${timestamp},${signature}`,
  }
}

export function verifyAuthHeader(header, method, path, options = {}) {
  const [addressRaw, timestampRaw, signature] = String(header || '').split(',')
  const address = normalizeAddress(addressRaw)
  const timestamp = Number(timestampRaw)
  const now = options.now || Date.now()

  if (!address || !Number.isFinite(timestamp) || !signature) {
    return { ok: false, error: 'Missing or invalid authorization' }
  }
  if (Math.abs(now - timestamp) > (options.maxAgeMs || AUTH_MAX_AGE_MS)) {
    return { ok: false, error: 'Authorization expired' }
  }

  try {
    const message = buildAuthMessage(timestampRaw, method, path)
    const recovered = normalizeAddress(verifyMessage(message, signature))
    if (recovered !== address) {
      return { ok: false, error: 'Authorization address mismatch' }
    }
    return { ok: true, address }
  } catch {
    return { ok: false, error: 'Invalid authorization signature' }
  }
}
