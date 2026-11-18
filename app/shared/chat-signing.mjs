// What a v2 device signature covers (docs/protocol/v2/signatures.md §4):
// label("chat/<kind>") ‖ canonical JSON of the body. No crypto here, so the
// same rules run in the web client, the mobile app (Hermes), the Bare core and
// the desktop engine. The desktop copy is server/src/core/chatSigning.js.
import { canonicalJsonBytes } from './canonical-json.mjs'

export const SIGNED_KINDS = Object.freeze([
  'message',
  'profile',
  'presence',
  'voice',
])

const HEX_64_REGEX = /^[0-9a-f]{64}$/
const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Reason the body cannot be signed or accepted, or '' when it is well formed. */
export function signedBodyError(body) {
  if (!isPlainObject(body)) return 'body must be an object'
  if (!SIGNED_KINDS.includes(body.kind)) return 'unknown kind'
  if (!HEX_64_REGEX.test(String(body.channelId))) return 'invalid channelId'
  if (!ADDRESS_REGEX.test(String(body.author))) return 'invalid author'
  if (!UUID_V4_REGEX.test(String(body.id))) return 'invalid id'
  if (!Number.isSafeInteger(body.createdAt) || body.createdAt < 0) {
    return 'invalid createdAt'
  }
  return ''
}

export const MESSAGE_CONTENT_MAX_LENGTH = 10000

/**
 * Reason a correctly signed body is not shown, or ''. Both cores apply exactly
 * this rule when reading, so every node shows the same entries; stricter
 * normal-form checks happen only where a node accepts a client's write.
 */
export function readableBodyError(body) {
  const error = signedBodyError(body)
  if (error) return error
  if (body.kind === 'message') {
    if (typeof body.content !== 'string' || !body.content.trim()) {
      return 'content must be non-empty text'
    }
    if (body.content.length > MESSAGE_CONTENT_MAX_LENGTH) {
      return 'content is too long'
    }
  }
  return ''
}

/** Bytes a device key signs for this body. Throws on an invalid body. */
export function signedPayload(body) {
  const error = signedBodyError(body)
  if (error) throw new TypeError(error)
  const prefix = new TextEncoder().encode(`most/v2/chat/${body.kind}\0`)
  const content = canonicalJsonBytes(body)
  const payload = new Uint8Array(prefix.length + content.length)
  payload.set(prefix)
  payload.set(content, prefix.length)
  return payload
}

const BASE64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toBase64Url(bytes) {
  let output = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 6) {
      output += BASE64URL[(buffer >>> (bits - 6)) & 63]
      bits -= 6
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) output += BASE64URL[(buffer << (6 - bits)) & 63]
  return output
}

/** Unpadded base64url to bytes, or null when malformed. */
export function fromBase64Url(text) {
  const value = String(text || '')
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) return null
  const bytes = []
  let buffer = 0
  let bits = 0
  for (const char of value) {
    buffer = (buffer << 6) | BASE64URL.indexOf(char)
    bits += 6
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
    buffer &= (1 << bits) - 1
  }
  if (buffer !== 0) return null
  return Uint8Array.from(bytes)
}
