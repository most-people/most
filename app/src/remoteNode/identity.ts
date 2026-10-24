import {
  HDNodeWallet,
  Mnemonic,
  computeHmac,
  decodeBase64,
  encodeBase64,
  getBytes,
  hexlify,
  pbkdf2,
  sha256,
  toUtf8Bytes,
} from 'ethers'
import nacl from 'tweetnacl'
import type { MobileIdentity } from '../mobileCore/types'

const SALT_PREFIX = '/most.box/'
const PBKDF2_ITERATIONS = 50_000
const PBKDF2_KEY_LENGTH = 32
export const DEVICE_CERT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEVICE_CERT_PREFIX = 'dc1'
const DEVICE_CERT_DOMAIN = 'most-box-device-cert-v1'
const DEVICE_KEY_DOMAIN = 'most-box-device-key-v1'
const SYNC_KEY_DOMAIN = 'most-box-account-sync-key-v1'

function toBase64Url(bytes: Uint8Array) {
  return encodeBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function fromBase64Url(value: string) {
  const token = String(value || '')
  return decodeBase64(
    token
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(token.length / 4) * 4, '=')
  )
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string) {
  return Uint8Array.from((hex.match(/../g) || []).map(b => parseInt(b, 16)))
}

/**
 * 登录：由密码派生账号种子，签发本机设备证书后丢弃种子，只返回可持久化的身份。
 * RN 没有可靠的安全随机数源，所以设备密钥由 HMAC(种子, 设备标签) 派生：
 * 保密性来自种子，标签只需让不同设备不重复。
 */
export async function createMobileIdentity(
  usernameInput: string,
  password: string,
  options: { now?: number; deviceLabel?: string; ttlMs?: number } = {}
): Promise<MobileIdentity> {
  const username = usernameInput.trim()
  if (!username || !password)
    throw new Error('Username and password are required')

  const key = pbkdf2(
    toUtf8Bytes(password),
    toUtf8Bytes(SALT_PREFIX + username),
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    'sha512'
  )
  const seed = getBytes(sha256(getBytes(key)))
  const wallet = HDNodeWallet.fromPhrase(Mnemonic.entropyToPhrase(seed))

  const label =
    options.deviceLabel || `${Date.now()}:${Math.random()}:${Math.random()}`
  const deviceSeed = getBytes(
    computeHmac('sha256', seed, toUtf8Bytes(`${DEVICE_KEY_DOMAIN}:${label}`))
  )
  const keyPair = nacl.sign.keyPair.fromSeed(deviceSeed)
  const publicKey = bytesToHex(keyPair.publicKey)

  const issuedAt = Math.floor(options.now ?? Date.now())
  const expiresAt = issuedAt + (options.ttlMs ?? DEVICE_CERT_TTL_MS)
  const signature = await wallet.signMessage(
    [DEVICE_CERT_DOMAIN, wallet.address, publicKey, issuedAt, expiresAt].join(
      '\n'
    )
  )
  const payload = toBase64Url(
    toUtf8Bytes(
      JSON.stringify({
        address: wallet.address,
        devicePublicKey: publicKey,
        issuedAt,
        expiresAt,
      })
    )
  )

  return {
    username,
    address: wallet.address,
    // 账号同步子密钥：与节点侧 deriveAccountSyncKeys 一致，单向派生，不含种子。
    syncKey: hexlify(computeHmac('sha256', seed, toUtf8Bytes(SYNC_KEY_DOMAIN))),
    device: {
      publicKey,
      secretKey: bytesToHex(keyPair.secretKey),
      cert: `${DEVICE_CERT_PREFIX}.${payload}.${signature}`,
    },
  }
}

export const RECOMMENDED_PASSWORD_LENGTH = 18

/** 按字符数计（汉字算 1），非空且短于推荐长度时提示风险；不拦截登录。 */
export function isPasswordShort(password: string) {
  return (
    password.length > 0 && [...password].length < RECOMMENDED_PASSWORD_LENGTH
  )
}

/** 设备密钥齐全且证书未过期；过期后需要用密码重新登录续期。 */
export function isUsableDevice(
  device: Partial<MobileIdentity['device']> | undefined
) {
  return Boolean(
    /^[0-9a-f]{64}$/.test(device?.publicKey || '') &&
    /^[0-9a-f]{128}$/.test(device?.secretKey || '') &&
    device?.cert &&
    readDeviceCertExpiry(device.cert) > Date.now()
  )
}

/** 仅读取到期时间，用于本机判断是否需要重新登录；是否有效以节点验证为准。 */
export function readDeviceCertExpiry(cert: string) {
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(String(cert).split('.')[1]))
    )
    const expiresAt = Number(payload.expiresAt)
    return Number.isSafeInteger(expiresAt) ? expiresAt : 0
  } catch {
    return 0
  }
}

export function normalizeAuthPath(path: string) {
  try {
    return new URL(path, 'http://most.box').pathname
  } catch {
    return String(path || '').split('?')[0] || '/'
  }
}

export function buildAuthMessage(
  timestamp: string,
  method: string,
  path: string
) {
  return `${timestamp}:${String(method || 'GET').toUpperCase()}:${normalizeAuthPath(path)}`
}

export async function buildMobileAuthHeader(
  identity: MobileIdentity | null,
  method: string,
  path: string,
  now = Date.now()
) {
  if (!identity?.device?.cert || !identity.device.secretKey) return ''
  const timestamp = String(now)
  const signature = nacl.sign.detached(
    toUtf8Bytes(buildAuthMessage(timestamp, method, path)),
    hexToBytes(identity.device.secretKey)
  )
  return `${identity.device.cert},${timestamp},${toBase64Url(signature)}`
}
