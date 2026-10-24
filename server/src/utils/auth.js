import { HDNodeWallet, decodeBase64, encodeBase64, verifyMessage } from 'ethers'
import nacl from 'tweetnacl'
import { normalizeAddress } from '../core/shared.js'
import { mostMnemonic } from './mostWallet.js'

export const AUTH_MAX_AGE_MS = 5 * 60 * 1000
export const DEVICE_CERT_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const DEVICE_CERT_MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000
const DEVICE_CERT_PREFIX = 'dc1'
const DEVICE_CERT_DOMAIN = 'most-box-device-cert-v1'
const DEVICE_PUBLIC_KEY_HEX = /^[0-9a-f]{64}$/
export { normalizeAddress }

export function buildAuthMessage(timestamp, method, path) {
  return `${timestamp}:${String(method || 'GET').toUpperCase()}:${normalizeAuthPath(path)}`
}

export function normalizeAuthPath(path) {
  try {
    return new URL(path, 'http://most.box').pathname
  } catch {
    return String(path || '').split('?')[0] || '/'
  }
}

function toBase64Url(bytes) {
  return encodeBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function fromBase64Url(value) {
  const token = String(value || '')
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  try {
    return decodeBase64(
      token
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(token.length / 4) * 4, '=')
    )
  } catch {
    return null
  }
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g).map(byte => parseInt(byte, 16)))
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function buildDeviceCertMessage({
  address,
  devicePublicKey,
  issuedAt,
  expiresAt,
}) {
  return [
    DEVICE_CERT_DOMAIN,
    address,
    devicePublicKey,
    issuedAt,
    expiresAt,
  ].join('\n')
}

/** 每台设备随机生成，不从种子派生，节点才能区分单台设备。 */
export function createDeviceKey() {
  const keyPair = nacl.sign.keyPair()
  return {
    publicKey: bytesToHex(keyPair.publicKey),
    secretKey: bytesToHex(keyPair.secretKey),
  }
}

/**
 * 由账号签名者（地址 + signMessage）给设备公钥签发有期限的授权证书。
 * 证书不含任何私钥，随每个请求一起发送。
 */
export async function issueDeviceCertWithSigner(
  signer,
  devicePublicKey,
  { now = Date.now(), ttlMs = DEVICE_CERT_TTL_MS } = {}
) {
  if (!DEVICE_PUBLIC_KEY_HEX.test(String(devicePublicKey || ''))) {
    throw new TypeError('Invalid device public key')
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > DEVICE_CERT_MAX_TTL_MS) {
    throw new RangeError('Invalid device certificate ttl')
  }
  const address = signer.address
  const issuedAt = Math.floor(now)
  const expiresAt = issuedAt + Math.floor(ttlMs)
  const signature = await signer.signMessage(
    buildDeviceCertMessage({ address, devicePublicKey, issuedAt, expiresAt })
  )
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ address, devicePublicKey, issuedAt, expiresAt })
    )
  )
  return `${DEVICE_CERT_PREFIX}.${payload}.${signature}`
}

/** 用账号种子签发；签发后种子即可丢弃。 */
export function issueDeviceCert(danger, devicePublicKey, options) {
  return issueDeviceCertWithSigner(
    HDNodeWallet.fromPhrase(mostMnemonic(danger)),
    devicePublicKey,
    options
  )
}

/** 仅读取到期时间用于本机提前续期，不验证签名；是否有效以节点验证为准。 */
export function readDeviceCertExpiry(cert) {
  try {
    const bytes = fromBase64Url(String(cert || '').split('.')[1])
    const expiresAt = Number(
      JSON.parse(new TextDecoder().decode(bytes)).expiresAt
    )
    return Number.isSafeInteger(expiresAt) ? expiresAt : 0
  } catch {
    return 0
  }
}

export function verifyDeviceCert(cert, { now = Date.now() } = {}) {
  const [prefix, payload64, signature] = String(cert || '').split('.')
  if (prefix !== DEVICE_CERT_PREFIX || !payload64 || !signature) {
    return { ok: false, error: 'Missing or invalid authorization' }
  }
  try {
    const bytes = fromBase64Url(payload64)
    if (!bytes) throw new Error('bad payload')
    const payload = JSON.parse(new TextDecoder().decode(bytes))
    const address = normalizeAddress(payload?.address)
    const { devicePublicKey, issuedAt, expiresAt } = payload
    if (
      !address ||
      !DEVICE_PUBLIC_KEY_HEX.test(String(devicePublicKey || '')) ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > DEVICE_CERT_MAX_TTL_MS
    ) {
      return { ok: false, error: 'Invalid device certificate' }
    }
    if (issuedAt > now + AUTH_MAX_AGE_MS) {
      return { ok: false, error: 'Invalid device certificate' }
    }
    if (now >= expiresAt) {
      return { ok: false, error: 'Device certificate expired' }
    }
    const recovered = normalizeAddress(
      verifyMessage(
        buildDeviceCertMessage({
          address: payload.address,
          devicePublicKey,
          issuedAt,
          expiresAt,
        }),
        signature
      )
    )
    if (recovered !== address) {
      return { ok: false, error: 'Authorization address mismatch' }
    }
    return { ok: true, address, devicePublicKey, expiresAt }
  } catch {
    return { ok: false, error: 'Invalid device certificate' }
  }
}

/** device = { publicKey, secretKey, cert }；Authorization: `<cert>,<timestamp>,<signature>` */
export function buildDeviceAuthHeader(device, method, path, now = Date.now()) {
  const timestamp = String(now)
  const signature = nacl.sign.detached(
    new TextEncoder().encode(buildAuthMessage(timestamp, method, path)),
    hexToBytes(device.secretKey)
  )
  return `${device.cert},${timestamp},${toBase64Url(signature)}`
}

export async function buildAuthHeaders(identity, method, path) {
  const device = identity?.device
  if (!device?.cert || !device?.secretKey) return {}
  return { Authorization: buildDeviceAuthHeader(device, method, path) }
}

export function verifyAuthHeader(header, method, path, options = {}) {
  const [cert, timestampRaw, signature] = String(header || '').split(',')
  const timestamp = Number(timestampRaw)
  const now = options.now || Date.now()

  if (!cert || !Number.isFinite(timestamp) || !signature) {
    return { ok: false, error: 'Missing or invalid authorization' }
  }
  if (Math.abs(now - timestamp) > (options.maxAgeMs || AUTH_MAX_AGE_MS)) {
    return { ok: false, error: 'Authorization expired' }
  }

  const certResult = verifyDeviceCert(cert, { now })
  if (!certResult.ok) return certResult

  const signatureBytes = fromBase64Url(signature)
  const valid =
    signatureBytes?.length === nacl.sign.signatureLength &&
    nacl.sign.detached.verify(
      new TextEncoder().encode(buildAuthMessage(timestampRaw, method, path)),
      signatureBytes,
      hexToBytes(certResult.devicePublicKey)
    )
  if (!valid) return { ok: false, error: 'Invalid authorization signature' }
  return {
    ok: true,
    address: certResult.address,
    devicePublicKey: certResult.devicePublicKey,
  }
}
