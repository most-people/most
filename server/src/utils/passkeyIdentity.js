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

export const PASSKEY_RP_ID = 'most.box'
export const PASSKEY_DISPLAY_NAME = 'MostBox Passkey'
export const PASSKEY_PRF_LABEL = 'mostbox.passkey.prf.v1'
export const PASSKEY_HKDF_INFO = 'mostbox/passkey/root-seed/v1'
export const PASSKEY_TEST_MESSAGE = 'MostBox passkey identity check v1'

const HKDF_SALT = new Uint8Array(32)
const PRF_OUTPUT_BYTES = 32

function requireBytes(value, expectedLength, label) {
  const bytes = getBytes(value)
  if (bytes.length !== expectedLength) {
    throw new TypeError(`${label} must be ${expectedLength} bytes`)
  }
  return bytes
}

export function getPasskeyPrfInput() {
  return getBytes(sha256(toUtf8Bytes(PASSKEY_PRF_LABEL)))
}

export function derivePasskeyDanger(prfOutput) {
  const inputKeyMaterial = requireBytes(
    prfOutput,
    PRF_OUTPUT_BYTES,
    'Passkey PRF output'
  )
  const pseudorandomKey = computeHmac('sha256', HKDF_SALT, inputKeyMaterial)
  const output = computeHmac(
    'sha256',
    pseudorandomKey,
    concat([toUtf8Bytes(PASSKEY_HKDF_INFO), new Uint8Array([1])])
  )
  return hexlify(getBytes(output).slice(0, PRF_OUTPUT_BYTES))
}

export function createPasskeyIdentity(prfOutput) {
  const danger = derivePasskeyDanger(prfOutput)
  return createPasskeyIdentityFromDanger(danger)
}

export function createPasskeyIdentityFromDanger(danger) {
  requireBytes(danger, PRF_OUTPUT_BYTES, 'Passkey root seed')
  const mnemonic = Mnemonic.entropyToPhrase(getBytes(danger))
  const wallet = HDNodeWallet.fromPhrase(mnemonic)

  return {
    username: `Passkey#${wallet.address.slice(-4)}`,
    address: wallet.address,
    danger,
  }
}

export function getPasskeyCredentialFingerprint(credentialId) {
  const bytes = getBytes(credentialId)
  if (bytes.length === 0) {
    throw new TypeError('Passkey credential ID must not be empty')
  }
  return sha256(bytes).slice(2, 14).toUpperCase()
}

export async function verifyPasskeyIdentity(identity) {
  const mnemonic = Mnemonic.entropyToPhrase(getBytes(identity.danger))
  const wallet = HDNodeWallet.fromPhrase(mnemonic)
  const signature = await wallet.signMessage(PASSKEY_TEST_MESSAGE)
  const recoveredAddress = verifyMessage(PASSKEY_TEST_MESSAGE, signature)

  return {
    signature,
    recoveredAddress,
    verified: recoveredAddress === identity.address,
  }
}
