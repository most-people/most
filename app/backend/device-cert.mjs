// Device certificate check for P2P signatures in the Bare core
// (docs/protocol/v2/signatures.md §4.4, §5): same format and rules as
// server/src/utils/auth.js verifyDeviceCert with checkTime: false, but the
// EIP-191 address recovery uses noble directly because ethers is not bundled
// into the Bare backend.
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { fromBase64Url } from '../shared/chat-signing.mjs'

const DEVICE_CERT_PREFIX = 'dc1'
const DEVICE_CERT_DOMAIN = 'most-box-device-cert-v1'
const DEVICE_CERT_MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000
const DEVICE_PUBLIC_KEY_HEX = /^[0-9a-f]{64}$/
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const SIGNATURE_REGEX = /^0x[0-9a-fA-F]{130}$/

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g).map(byte => parseInt(byte, 16)))
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Address (lowercase) that signed `message` with EIP-191 personal_sign. */
export function recoverPersonalSignAddress(message, signatureHex) {
  if (!SIGNATURE_REGEX.test(String(signatureHex))) return ''
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)
  const prefix = encoder.encode(
    `\x19Ethereum Signed Message:\n${messageBytes.length}`
  )
  const data = new Uint8Array(prefix.length + messageBytes.length)
  data.set(prefix)
  data.set(messageBytes, prefix.length)
  const signature = hexToBytes(signatureHex.slice(2))
  const v = signature[64]
  const recovery = v >= 27 ? v - 27 : v
  if (recovery !== 0 && recovery !== 1) return ''
  try {
    const publicKey = secp256k1.Signature.fromCompact(signature.slice(0, 64))
      .addRecoveryBit(recovery)
      .recoverPublicKey(keccak_256(data))
      .toRawBytes(false)
    return `0x${bytesToHex(keccak_256(publicKey.slice(1)).slice(12))}`
  } catch {
    return ''
  }
}

/** { ok, address, devicePublicKey } without issue/expiry checks. */
export function verifyDeviceCertP2P(cert) {
  const [prefix, payload64, signature, extra] = String(cert || '').split('.')
  if (prefix !== DEVICE_CERT_PREFIX || !payload64 || !signature || extra) {
    return { ok: false, error: 'Invalid device certificate' }
  }
  try {
    const bytes = fromBase64Url(payload64)
    if (!bytes) throw new Error('bad payload')
    const payload = JSON.parse(new TextDecoder().decode(bytes))
    const { address, devicePublicKey, issuedAt, expiresAt } = payload || {}
    if (
      !ADDRESS_REGEX.test(String(address)) ||
      !DEVICE_PUBLIC_KEY_HEX.test(String(devicePublicKey || '')) ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > DEVICE_CERT_MAX_TTL_MS
    ) {
      return { ok: false, error: 'Invalid device certificate' }
    }
    const message = [
      DEVICE_CERT_DOMAIN,
      address,
      devicePublicKey,
      issuedAt,
      expiresAt,
    ].join('\n')
    const recovered = recoverPersonalSignAddress(message, signature)
    if (!recovered || recovered !== address.toLowerCase()) {
      return { ok: false, error: 'Authorization address mismatch' }
    }
    return { ok: true, address: recovered, devicePublicKey }
  } catch {
    return { ok: false, error: 'Invalid device certificate' }
  }
}
