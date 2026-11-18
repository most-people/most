// v2 chat identity (docs/protocol/v2/signatures.md §7, decision D3): separate
// from the v1 wallet, derived with scrypt so password guessing costs more.
//   chatSeed = scrypt(label("password") ‖ password, H("identity", username),
//                     N = 2^17, r = 8, p = 1, 32 bytes)
// The password label keeps the input non-empty (invite identities use an
// empty password, which libsodium rejects) and separates the domain.
// Browser-safe: ethers only. The mobile app derives the same seed natively in
// the Bare core (app/backend/scrypt-native.mjs deriveChatSeed).
import {
  HDNodeWallet,
  Mnemonic,
  computeHmac,
  concat,
  getBytes,
  hexlify,
  scrypt,
  sha256,
  toUtf8Bytes,
} from 'ethers'

export const CHAT_IDENTITY_LOG_N = 17
export const CHAT_IDENTITY_R = 8
export const CHAT_IDENTITY_P = 1

function label(purpose) {
  return toUtf8Bytes(`most/v2/${purpose}\0`)
}

/** 32-byte salt: H("identity", username). */
export function chatIdentitySalt(username) {
  return getBytes(
    sha256(concat([label('identity'), toUtf8Bytes(String(username))]))
  )
}

/** scrypt password input: label("password") ‖ UTF-8 password. */
export function chatIdentityPassword(password) {
  return getBytes(concat([label('password'), toUtf8Bytes(String(password))]))
}

/** chatSeed as 0x-hex. */
export async function deriveChatSeed(
  username,
  password,
  { logN = CHAT_IDENTITY_LOG_N, progress } = {}
) {
  return hexlify(
    await scrypt(
      chatIdentityPassword(password),
      chatIdentitySalt(username),
      2 ** logN,
      CHAT_IDENTITY_R,
      CHAT_IDENTITY_P,
      32,
      progress
    )
  )
}

/** Chat address and account sync key for a chat seed (0x-hex or bytes). */
export function chatAccountFromSeed(chatSeed) {
  const seed = getBytes(chatSeed)
  const wallet = HDNodeWallet.fromPhrase(Mnemonic.entropyToPhrase(seed))
  return {
    address: wallet.address,
    syncKey: computeHmac('sha256', seed, label('account/sync-key')),
  }
}

const ACCOUNT_MIGRATION_DOMAIN = 'most-box-account-migrate-v2'

/** Text the v1 account signs (EIP-191) to hand its node data to the v2 identity. */
export function buildAccountMigrationMessage(oldAddress, newAddress) {
  return [
    ACCOUNT_MIGRATION_DOMAIN,
    String(oldAddress).toLowerCase(),
    String(newAddress).toLowerCase(),
  ].join('\n')
}

/** Signs the migration with the v1 wallet seed (0x-hex), returning the signature. */
export function signAccountMigration(v1Seed, newAddress) {
  const wallet = HDNodeWallet.fromPhrase(
    Mnemonic.entropyToPhrase(getBytes(v1Seed))
  )
  return wallet.signMessage(
    buildAccountMigrationMessage(wallet.address, newAddress)
  )
}
