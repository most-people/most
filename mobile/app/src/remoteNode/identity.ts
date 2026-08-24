import {
  HDNodeWallet,
  Mnemonic,
  getBytes,
  hexlify,
  pbkdf2,
  sha256,
  toUtf8Bytes,
} from 'ethers'
import type { MobileIdentity } from '../mobileCore/types'

const SALT_PREFIX = '/most.box/'
const PBKDF2_ITERATIONS = 50_000
const PBKDF2_KEY_LENGTH = 32

export function createMobileIdentity(
  usernameInput: string,
  password: string
): MobileIdentity {
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

  return {
    username,
    address: wallet.address,
    danger: hexlify(seed),
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
  if (!identity?.danger) return ''
  const timestamp = String(now)
  const mnemonic = Mnemonic.entropyToPhrase(getBytes(identity.danger))
  const wallet = HDNodeWallet.fromPhrase(mnemonic)
  const signature = await wallet.signMessage(
    buildAuthMessage(timestamp, method, path)
  )
  return `${wallet.address},${timestamp},${signature}`
}
