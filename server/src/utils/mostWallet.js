import {
  decodeBase64,
  encodeBase64,
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
const PBKDF2_ITERATIONS = 50_000
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

export async function mostSignMessage(danger, message) {
  const account = HDNodeWallet.fromPhrase(mostMnemonic(danger))
  return {
    address: account.address,
    signature: await account.signMessage(message),
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
  const [prefix, nonce64, encrypted64] = String(data || '').split('.')
  if (prefix !== 'mp://1' || !nonce64 || !encrypted64) return ''

  const key = getBytes(danger).slice(0, nacl.secretbox.keyLength)
  const decrypted = nacl.secretbox.open(
    decodeBase64(encrypted64),
    decodeBase64(nonce64),
    key
  )

  return decrypted ? new TextDecoder().decode(decrypted) : ''
}
