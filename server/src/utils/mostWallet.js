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
import * as sr25519 from '@scure/sr25519'
import { blake2b } from '@noble/hashes/blake2.js'
import { base58 } from '@scure/base'

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

export function mostCrust(danger) {
  const entropy = getBytes(danger)
  const mnemonic = Mnemonic.entropyToPhrase(entropy)

  const salt = toUtf8Bytes('mnemonic')
  const seed = pbkdf2(entropy, salt, 2048, 64, 'sha512')
  const miniSecret = getBytes(seed).slice(0, 32)

  const secretKey = sr25519.secretFromSeed(miniSecret)
  const publicKey = sr25519.getPublicKey(secretKey)

  const prefixBytes = new Uint8Array([0x50, 0x80])
  const content = new Uint8Array(prefixBytes.length + publicKey.length)
  content.set(prefixBytes)
  content.set(publicKey, prefixBytes.length)

  const ss58Prefix = new TextEncoder().encode('SS58PRE')
  const checksumContent = new Uint8Array(ss58Prefix.length + content.length)
  checksumContent.set(ss58Prefix)
  checksumContent.set(content, ss58Prefix.length)

  const checksum = blake2b(checksumContent, { dkLen: 64 }).subarray(0, 2)
  const addressBytes = new Uint8Array(content.length + checksum.length)
  addressBytes.set(content)
  addressBytes.set(checksum, content.length)

  return {
    crust_address: base58.encode(addressBytes),
    crust_mnemonic: mnemonic,
    sign: message => {
      const signature = sr25519.sign(secretKey, toUtf8Bytes(message))
      return hexlify(signature)
    },
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
