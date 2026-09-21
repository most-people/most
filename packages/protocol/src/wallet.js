/**
 * Account derivation shared by the desktop daemon and the mobile client.
 *
 * Same username + password must derive the same account address on every
 * runtime, so this is copied verbatim from `server/src/utils/mostWallet.js`
 * (salt prefix, PBKDF2 parameters, entropy derivation, HD node path).
 *
 * Only the pure ethers-based derivation lives here. The nacl-based helpers
 * (`most25519`, `mostEncode`, `mostBoxEncrypt`, …) stay in the daemon because
 * they are not part of the cross-device contract.
 */
import {
  Mnemonic,
  HDNodeWallet,
  getBytes,
  hexlify,
  pbkdf2,
  sha256,
  toUtf8Bytes,
} from 'ethers'

const SALT_PREFIX = '/most.box/'
export const DEFAULT_PBKDF2_ITERATIONS = 50_000
export const MIN_PBKDF2_ITERATIONS = 1
export const MAX_PBKDF2_ITERATIONS = 1_000_000
const PBKDF2_KEY_LENGTH = 32

export function mostWallet(
  username,
  password,
  iterations = DEFAULT_PBKDF2_ITERATIONS
) {
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new RangeError(
      `PBKDF2 iterations must be an integer between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`
    )
  }
  const salt = toUtf8Bytes(SALT_PREFIX + username)
  const p = toUtf8Bytes(password)
  const kdf = pbkdf2(p, salt, iterations, PBKDF2_KEY_LENGTH, 'sha512')
  const seed = getBytes(sha256(getBytes(kdf)))
  const mnemonic = Mnemonic.entropyToPhrase(seed)
  const account = HDNodeWallet.fromPhrase(mnemonic)
  return {
    username,
    address: account.address,
    danger: hexlify(seed),
  }
}

export function mostMnemonic(danger) {
  return Mnemonic.entropyToPhrase(getBytes(danger))
}

export async function mostSignMessage(danger, message) {
  const account = HDNodeWallet.fromPhrase(mostMnemonic(danger))
  return {
    address: account.address,
    signature: await account.signMessage(message),
  }
}
