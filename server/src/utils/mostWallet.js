/**
 * Account derivation and the nacl-based wallet helpers.
 *
 * `mostWallet` / `mostMnemonic` / `mostSignMessage` live in
 * `@most-box/protocol` because the mobile app must derive the same account
 * address from the same username and password. The nacl helpers stay here: they
 * are daemon-only and never run inside the Bare worklet.
 */
import {
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  mostMnemonic,
  mostSignMessage,
  mostWallet,
} from '@most-box/protocol'
import { decodeBase64, encodeBase64, getBytes, hexlify } from 'ethers'
import nacl from 'tweetnacl'

const BOX_TOKEN_VERSION = 1
const BOX_TIMESTAMP_BYTES = 8
const BOX_TOKEN_HEADER_BYTES =
  1 + BOX_TIMESTAMP_BYTES + nacl.secretbox.nonceLength
const BOX_TOKEN_MIN_BYTES =
  BOX_TOKEN_HEADER_BYTES + nacl.secretbox.overheadLength
const BOX_LABEL = new TextEncoder().encode('MP-AE')

export {
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  mostMnemonic,
  mostSignMessage,
  mostWallet,
}

export function most25519(danger) {
  const x25519KeyPair = nacl.box.keyPair.fromSecretKey(getBytes(danger))
  const ed25519KeyPair = nacl.sign.keyPair.fromSeed(getBytes(danger))
  return {
    public_key: hexlify(x25519KeyPair.publicKey),
    private_key: hexlify(x25519KeyPair.secretKey),
    ed_public_key: hexlify(ed25519KeyPair.publicKey),
  }
}

export function mostEncode(text, danger) {
  const bytes = new TextEncoder().encode(text)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const key = getBytes(danger).slice(0, nacl.secretbox.keyLength)
  const encrypted = nacl.secretbox(bytes, nonce, key)

  return ['mp://1', encodeBase64(nonce), encodeBase64(encrypted)].join('.')
}

export function mostDecode(data, danger) {
  const result = tryMostDecode(data, danger)
  return result.ok ? result.content : ''
}

export function tryMostDecode(data, danger) {
  try {
    const [prefix, nonce64, encrypted64] = String(data || '').split('.')
    if (prefix !== 'mp://1' || !nonce64 || !encrypted64) {
      return { ok: false, content: '' }
    }

    const key = getBytes(danger).slice(0, nacl.secretbox.keyLength)
    const decrypted = nacl.secretbox.open(
      decodeBase64(encrypted64),
      decodeBase64(nonce64),
      key
    )

    return decrypted
      ? { ok: true, content: new TextDecoder().decode(decrypted) }
      : { ok: false, content: '' }
  } catch {
    return { ok: false, content: '' }
  }
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function encodeBase64Url(bytes) {
  return encodeBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodeBase64Url(value) {
  const token = String(value || '').trim()
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return null

  try {
    const standard = token
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(token.length / 4) * 4, '=')
    return decodeBase64(standard)
  } catch {
    return null
  }
}

function encodeTimestampMs(value) {
  const output = new Uint8Array(BOX_TIMESTAMP_BYTES)
  const view = new DataView(output.buffer)
  view.setBigUint64(0, BigInt(value), false)
  return output
}

function decodeTimestampMs(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Number(view.getBigUint64(0, false))
}

function readBoxTokenPayload(data) {
  const payload = decodeBase64Url(data)
  if (
    !payload ||
    payload.length < BOX_TOKEN_MIN_BYTES ||
    payload[0] !== BOX_TOKEN_VERSION
  ) {
    return null
  }

  const timestampBytes = payload.slice(1, 1 + BOX_TIMESTAMP_BYTES)
  const nonce = payload.slice(1 + BOX_TIMESTAMP_BYTES, BOX_TOKEN_HEADER_BYTES)
  const encrypted = payload.slice(BOX_TOKEN_HEADER_BYTES)

  return {
    version: payload[0],
    timestampMs: decodeTimestampMs(timestampBytes),
    nonce,
    encrypted,
  }
}

function deriveDirectionalBoxKey(
  senderPublicKey,
  recipientPublicKey,
  sharedKey
) {
  return nacl
    .hash(
      concatBytes([BOX_LABEL, senderPublicKey, recipientPublicKey, sharedKey])
    )
    .slice(0, nacl.secretbox.keyLength)
}

export function mostBoxEncrypt(text, { senderPrivateKey, recipientPublicKey }) {
  const senderSecretKey = getBytes(senderPrivateKey)
  const senderPublicKey =
    nacl.box.keyPair.fromSecretKey(senderSecretKey).publicKey
  const recipientPublicKeyBytes = getBytes(recipientPublicKey)
  const sharedKey = nacl.box.before(recipientPublicKeyBytes, senderSecretKey)
  const boxKey = deriveDirectionalBoxKey(
    senderPublicKey,
    recipientPublicKeyBytes,
    sharedKey
  )
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const encrypted = nacl.secretbox(
    new TextEncoder().encode(text),
    nonce,
    boxKey
  )
  const payload = concatBytes([
    new Uint8Array([BOX_TOKEN_VERSION]),
    encodeTimestampMs(Date.now()),
    nonce,
    encrypted,
  ])

  return encodeBase64Url(payload)
}

export function parseMostBoxToken(data) {
  const payload = readBoxTokenPayload(data)
  if (!payload) return null

  return {
    version: payload.version,
    timestampMs: payload.timestampMs,
    nonce: encodeBase64Url(payload.nonce),
  }
}

export function mostBoxDecrypt(data, { senderPublicKey, recipientPrivateKey }) {
  const payload = readBoxTokenPayload(data)
  if (!payload) return ''

  try {
    const recipientSecretKey = getBytes(recipientPrivateKey)
    const recipientPublicKey =
      nacl.box.keyPair.fromSecretKey(recipientSecretKey).publicKey
    const senderPublicKeyBytes = getBytes(senderPublicKey)
    const sharedKey = nacl.box.before(senderPublicKeyBytes, recipientSecretKey)
    const boxKey = deriveDirectionalBoxKey(
      senderPublicKeyBytes,
      recipientPublicKey,
      sharedKey
    )
    const decrypted = nacl.secretbox.open(
      payload.encrypted,
      payload.nonce,
      boxKey
    )

    return decrypted ? new TextDecoder().decode(decrypted) : ''
  } catch {
    return ''
  }
}
