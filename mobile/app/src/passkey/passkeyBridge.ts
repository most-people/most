import { decodeBase64, encodeBase64, getBytes, hexlify } from 'ethers'
import nacl from 'tweetnacl'

export const PASSKEY_BRIDGE_VERSION = '1'
export const PASSKEY_BRIDGE_PURPOSE = 'mostbox.passkey-lab.identity.v1'
export const PASSKEY_BRIDGE_MAX_AGE_MS = 5 * 60 * 1000
export const PASSKEY_CALLBACK_HOST = 'passkey-callback'

const BOX_TOKEN_VERSION = 1
const BOX_TIMESTAMP_BYTES = 8
const BOX_TOKEN_HEADER_BYTES =
  1 + BOX_TIMESTAMP_BYTES + nacl.secretbox.nonceLength
const BOX_TOKEN_MIN_BYTES =
  BOX_TOKEN_HEADER_BYTES + nacl.secretbox.overheadLength
const BOX_LABEL = new TextEncoder().encode('MP-AE')
const CALLBACK_FIELDS = new Set(['v', 'state', 'senderPublicKey', 'token'])

export type PasskeyBridgeMode = 'create' | 'authenticate'

export type PasskeyBridgePending = {
  version: string
  state: string
  recipientPrivateKey: string
  recipientPublicKey: string
  createdAt: number
  used: boolean
}

export type PasskeyRandomValues = (bytes: Uint8Array<ArrayBuffer>) => void

function defaultRandomValues(bytes: Uint8Array<ArrayBuffer>) {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('PASSKEY_BRIDGE_SECURE_RANDOM_UNAVAILABLE')
  }
  crypto.getRandomValues(bytes)
}

function secureRandomBytes(length: number, randomValues: PasskeyRandomValues) {
  const bytes = new Uint8Array(length)
  randomValues(bytes)
  return bytes
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function encodeBase64Url(bytes: Uint8Array) {
  return encodeBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodeBase64Url(value: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    return getBytes(
      decodeBase64(
        value
          .replaceAll('-', '+')
          .replaceAll('_', '/')
          .padEnd(Math.ceil(value.length / 4) * 4, '=')
      )
    )
  } catch {
    return null
  }
}

function encodeTimestampMs(value: number) {
  const output = new Uint8Array(BOX_TIMESTAMP_BYTES)
  new DataView(output.buffer).setBigUint64(0, BigInt(value), false)
  return output
}

function readBoxToken(value: string) {
  const payload = decodeBase64Url(value)
  if (
    !payload ||
    payload.length < BOX_TOKEN_MIN_BYTES ||
    payload[0] !== BOX_TOKEN_VERSION
  ) {
    return null
  }
  const view = new DataView(
    payload.buffer,
    payload.byteOffset + 1,
    BOX_TIMESTAMP_BYTES
  )
  return {
    timestampMs: Number(view.getBigUint64(0, false)),
    nonce: payload.slice(1 + BOX_TIMESTAMP_BYTES, BOX_TOKEN_HEADER_BYTES),
    encrypted: payload.slice(BOX_TOKEN_HEADER_BYTES),
  }
}

function deriveDirectionalKey(
  senderPublicKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  sharedKey: Uint8Array
) {
  return nacl
    .hash(
      concatBytes([BOX_LABEL, senderPublicKey, recipientPublicKey, sharedKey])
    )
    .slice(0, nacl.secretbox.keyLength)
}

function isHexBytes(value: unknown, length: number) {
  if (typeof value !== 'string') return false
  try {
    return getBytes(value).length === length
  } catch {
    return false
  }
}

function getQueryFields(url: URL) {
  const fields = new Set<string>()
  const query = url.search.startsWith('?') ? url.search.slice(1) : url.search
  for (const part of query.split('&')) {
    if (!part) continue
    const key = decodeURIComponent(part.split('=')[0] || '')
    if (fields.has(key)) return null
    fields.add(key)
  }
  return fields
}

function decryptToken(
  token: string,
  senderPublicKey: string,
  recipientPrivateKey: string
) {
  const payload = readBoxToken(token)
  if (!payload) return ''
  try {
    const recipientSecret = getBytes(recipientPrivateKey)
    const recipientPublic =
      nacl.box.keyPair.fromSecretKey(recipientSecret).publicKey
    const senderPublic = getBytes(senderPublicKey)
    const sharedKey = nacl.box.before(senderPublic, recipientSecret)
    const key = deriveDirectionalKey(senderPublic, recipientPublic, sharedKey)
    const plaintext = nacl.secretbox.open(payload.encrypted, payload.nonce, key)
    return plaintext ? new TextDecoder().decode(plaintext) : ''
  } catch {
    return ''
  }
}

export function isPasskeyCallbackUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'most:' &&
      url.hostname === PASSKEY_CALLBACK_HOST &&
      (url.pathname === '' || url.pathname === '/')
    )
  } catch {
    return false
  }
}

export function createPasskeyBridgeRequest(
  now = Date.now(),
  randomValues: PasskeyRandomValues = defaultRandomValues
): PasskeyBridgePending {
  const recipientPrivateKey = hexlify(secureRandomBytes(32, randomValues))
  const recipientPublicKey = hexlify(
    nacl.box.keyPair.fromSecretKey(getBytes(recipientPrivateKey)).publicKey
  )
  return {
    version: PASSKEY_BRIDGE_VERSION,
    state: hexlify(secureRandomBytes(32, randomValues)),
    recipientPrivateKey,
    recipientPublicKey,
    createdAt: now,
    used: false,
  }
}

export function buildPasskeyLabBridgeUrl(
  pending: PasskeyBridgePending,
  mode: PasskeyBridgeMode
) {
  const url = new URL('https://most.box/passkey-lab/')
  url.searchParams.set('bridge', 'native')
  url.searchParams.set('mode', mode)
  url.searchParams.set('v', PASSKEY_BRIDGE_VERSION)
  url.searchParams.set('state', pending.state)
  url.searchParams.set('recipientPublicKey', pending.recipientPublicKey)
  return url.toString()
}

export function createPasskeyBridgeCallback(
  input: {
    state: string
    recipientPublicKey: string
    danger: string
    credentialId: string
  },
  randomValues: PasskeyRandomValues = defaultRandomValues
) {
  const senderPrivateKey = secureRandomBytes(32, randomValues)
  const senderPublicKey =
    nacl.box.keyPair.fromSecretKey(senderPrivateKey).publicKey
  const recipientPublicKey = getBytes(input.recipientPublicKey)
  const sharedKey = nacl.box.before(recipientPublicKey, senderPrivateKey)
  const key = deriveDirectionalKey(
    senderPublicKey,
    recipientPublicKey,
    sharedKey
  )
  const nonce = secureRandomBytes(nacl.secretbox.nonceLength, randomValues)
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      v: PASSKEY_BRIDGE_VERSION,
      state: input.state,
      purpose: PASSKEY_BRIDGE_PURPOSE,
      danger: input.danger,
      credentialId: input.credentialId,
    })
  )
  const encrypted = nacl.secretbox(plaintext, nonce, key)
  const token = encodeBase64Url(
    concatBytes([
      new Uint8Array([BOX_TOKEN_VERSION]),
      encodeTimestampMs(Date.now()),
      nonce,
      encrypted,
    ])
  )
  const callback = new URL(`most://${PASSKEY_CALLBACK_HOST}`)
  callback.searchParams.set('v', PASSKEY_BRIDGE_VERSION)
  callback.searchParams.set('state', input.state)
  callback.searchParams.set('senderPublicKey', hexlify(senderPublicKey))
  callback.searchParams.set('token', token)
  return callback.toString()
}

export function consumePasskeyBridgeCallback(
  value: string,
  pending: PasskeyBridgePending,
  now = Date.now()
) {
  if (pending.used) throw new Error('PASSKEY_BRIDGE_REPLAYED')
  if (
    now < pending.createdAt ||
    now - pending.createdAt > PASSKEY_BRIDGE_MAX_AGE_MS
  ) {
    throw new Error('PASSKEY_BRIDGE_EXPIRED')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('PASSKEY_BRIDGE_INVALID_CALLBACK')
  }
  const fields = getQueryFields(url)
  if (
    !isPasskeyCallbackUrl(value) ||
    !fields ||
    fields.size !== CALLBACK_FIELDS.size ||
    [...fields].some(field => !CALLBACK_FIELDS.has(field)) ||
    url.searchParams.get('v') !== PASSKEY_BRIDGE_VERSION ||
    url.searchParams.get('state') !== pending.state
  ) {
    throw new Error('PASSKEY_BRIDGE_INVALID_CALLBACK')
  }

  const senderPublicKey = url.searchParams.get('senderPublicKey') || ''
  const token = url.searchParams.get('token') || ''
  const tokenPayload = readBoxToken(token)
  if (!isHexBytes(senderPublicKey, 32) || !tokenPayload) {
    throw new Error('PASSKEY_BRIDGE_INVALID_CALLBACK')
  }
  if (
    tokenPayload.timestampMs < pending.createdAt ||
    tokenPayload.timestampMs > now + 30_000 ||
    now - tokenPayload.timestampMs > PASSKEY_BRIDGE_MAX_AGE_MS
  ) {
    throw new Error('PASSKEY_BRIDGE_EXPIRED')
  }

  const plaintext = decryptToken(
    token,
    senderPublicKey,
    pending.recipientPrivateKey
  )
  if (!plaintext) throw new Error('PASSKEY_BRIDGE_DECRYPT_FAILED')

  let payload: unknown
  try {
    payload = JSON.parse(plaintext) as unknown
  } catch {
    throw new Error('PASSKEY_BRIDGE_INVALID_PAYLOAD')
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('v' in payload) ||
    payload.v !== PASSKEY_BRIDGE_VERSION ||
    !('state' in payload) ||
    payload.state !== pending.state ||
    !('purpose' in payload) ||
    payload.purpose !== PASSKEY_BRIDGE_PURPOSE ||
    !('danger' in payload) ||
    !isHexBytes(payload.danger, 32) ||
    !('credentialId' in payload) ||
    typeof payload.credentialId !== 'string' ||
    !payload.credentialId
  ) {
    throw new Error('PASSKEY_BRIDGE_INVALID_PAYLOAD')
  }

  pending.used = true
  return {
    danger: payload.danger as string,
    credentialId: payload.credentialId,
  }
}
