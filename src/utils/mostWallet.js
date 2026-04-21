import {
  pbkdf2,
  sha256,
  getBytes,
  Mnemonic,
  HDNodeWallet,
  toUtf8Bytes,
  hexlify,
} from 'ethers'
import nacl from 'tweetnacl'

const SALT_PREFIX = '/most.box/'
const PBKDF2_ITERATIONS = 3
const PBKDF2_KEY_LENGTH = 32

export function mostWallet(username, password) {
  const salt = toUtf8Bytes(SALT_PREFIX + username)
  const p = toUtf8Bytes(password)
  const kdf = pbkdf2(p, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha512')
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

export function most25519(danger) {
  const x25519KeyPair = nacl.box.keyPair.fromSecretKey(getBytes(danger))
  const ed25519KeyPair = nacl.sign.keyPair.fromSeed(getBytes(danger))
  return {
    public_key: hexlify(x25519KeyPair.publicKey),
    private_key: hexlify(x25519KeyPair.secretKey),
    ed_public_key: hexlify(ed25519KeyPair.publicKey),
  }
}
