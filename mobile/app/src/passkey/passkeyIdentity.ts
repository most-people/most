import {
  HDNodeWallet,
  Mnemonic,
  computeHmac,
  concat,
  getBytes,
  hexlify,
  sha256,
  toUtf8Bytes,
  verifyMessage,
} from 'ethers'

export const PASSKEY_PRF_LABEL = 'mostbox.passkey.prf.v1'
export const PASSKEY_HKDF_INFO = 'mostbox/passkey/root-seed/v1'
export const PASSKEY_TEST_MESSAGE = 'MostBox passkey identity check v1'

const HKDF_SALT = new Uint8Array(32)

function requireBytes(value: string | Uint8Array, label: string) {
  const bytes = getBytes(value)
  if (bytes.length !== 32) throw new TypeError(`${label} must be 32 bytes`)
  return bytes
}

export function getPasskeyPrfInput() {
  return getBytes(sha256(toUtf8Bytes(PASSKEY_PRF_LABEL)))
}

export function derivePasskeyDanger(prfOutput: string | Uint8Array) {
  const inputKeyMaterial = requireBytes(prfOutput, 'Passkey PRF output')
  const pseudorandomKey = computeHmac('sha256', HKDF_SALT, inputKeyMaterial)
  const output = computeHmac(
    'sha256',
    pseudorandomKey,
    concat([toUtf8Bytes(PASSKEY_HKDF_INFO), new Uint8Array([1])])
  )
  return hexlify(getBytes(output).slice(0, 32))
}

export function createPasskeyIdentity(prfOutput: string | Uint8Array) {
  return createPasskeyIdentityFromDanger(derivePasskeyDanger(prfOutput))
}

export function createPasskeyIdentityFromDanger(danger: string | Uint8Array) {
  const rootSeed = hexlify(requireBytes(danger, 'Passkey root seed'))
  const mnemonic = Mnemonic.entropyToPhrase(getBytes(rootSeed))
  const wallet = HDNodeWallet.fromPhrase(mnemonic)
  return {
    username: `Passkey#${wallet.address.slice(-4)}`,
    address: wallet.address,
    danger: rootSeed,
  }
}

export function getPasskeyCredentialFingerprint(
  credentialId: string | Uint8Array
) {
  const bytes = getBytes(credentialId)
  if (!bytes.length) throw new TypeError('Passkey credential ID is empty')
  return sha256(bytes).slice(2, 14).toUpperCase()
}

export async function verifyPasskeyIdentity(
  identity: ReturnType<typeof createPasskeyIdentityFromDanger>
) {
  const mnemonic = Mnemonic.entropyToPhrase(getBytes(identity.danger))
  const wallet = HDNodeWallet.fromPhrase(mnemonic)
  const signature = await wallet.signMessage(PASSKEY_TEST_MESSAGE)
  const recoveredAddress = verifyMessage(PASSKEY_TEST_MESSAGE, signature)
  return {
    recoveredAddress,
    verified: recoveredAddress === identity.address,
  }
}
