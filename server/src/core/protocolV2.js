// Protocol v2 primitives: every hash, MAC and key derivation starts with a
// label. See docs/protocol/v2/envelope.md §3. The mobile core has an
// identical copy in app/backend/protocol-v2.mjs; shared vectors keep them equal.
import { createHash, createHmac } from 'node:crypto'

export const PROTOCOL_VERSION = 2

const LABEL_PREFIX = 'most/v2/'
const PURPOSE_REGEX = /^[a-z0-9/-]+$/

export function label(purpose) {
  if (typeof purpose !== 'string' || !PURPOSE_REGEX.test(purpose)) {
    throw new TypeError(`Invalid protocol label purpose: ${purpose}`)
  }
  return Buffer.from(`${LABEL_PREFIX}${purpose}\0`, 'utf8')
}

function toBytes(part) {
  return typeof part === 'string' ? Buffer.from(part, 'utf8') : part
}

/** SHA-256(label(purpose) ‖ parts...). Strings are UTF-8 encoded. */
export function H(purpose, ...parts) {
  const hash = createHash('sha256').update(label(purpose))
  for (const part of parts) hash.update(toBytes(part))
  return hash.digest()
}

/** HMAC-SHA256(key, label(purpose) ‖ parts...). */
export function MAC(key, purpose, ...parts) {
  const mac = createHmac('sha256', key).update(label(purpose))
  for (const part of parts) mac.update(toBytes(part))
  return mac.digest()
}

/** HMAC-SHA256(key, label(purpose)): a 32-byte subkey. */
export function KDF(key, purpose) {
  return MAC(key, purpose)
}
