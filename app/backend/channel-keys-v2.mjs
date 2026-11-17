// Protocol v2 channel keys: see docs/protocol/v2/channel-keys.md. The desktop
// engine has an identical copy in server/src/core/channelKeysV2.js; shared
// vectors in docs/protocol/vectors/v2/channel.json keep them equal.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import b4a from 'b4a'
import nacl from 'tweetnacl'
import { H, KDF, MAC } from './protocol-v2.mjs'

export const CHANNEL_KEY_BYTES = 32
export const CHANNEL_CREDENTIAL_LENGTH = 52

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const CREDENTIAL_REGEX = /^[a-z2-7]{52}$/
const PUBLIC_NAME_REGEX = /^[a-z0-9_-]{3,30}$/
const HEX32_REGEX = /^[0-9a-f]{64}$/

function assertKey(key) {
  if (!key || key.length !== CHANNEL_KEY_BYTES) {
    throw new TypeError('Channel key must be 32 bytes')
  }
  return key
}

export function createChannelKey(createBytes = randomBytes) {
  return assertKey(b4a.from(createBytes(CHANNEL_KEY_BYTES)))
}

/** RFC 4648 base32, lowercase, no padding: 52 characters for 32 bytes. */
export function encodeChannelCredential(key) {
  assertKey(key)
  let output = ''
  let buffer = 0
  let bits = 0
  for (const byte of key) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31]
  return output
}

/** Returns the 32-byte key, or null when the credential is malformed. */
export function decodeChannelCredential(input) {
  const credential = String(input || '')
    .trim()
    .toLowerCase()
  if (!CREDENTIAL_REGEX.test(credential)) return null
  const bytes = []
  let buffer = 0
  let bits = 0
  for (const char of credential) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
    buffer &= (1 << bits) - 1
  }
  // 52 characters carry 260 bits; the 4 trailing bits must be zero.
  if ((buffer & ((1 << bits) - 1)) !== 0) return null
  return b4a.from(bytes)
}

export function channelIdFromKey(key) {
  return b4a.toString(H('channel/id', assertKey(key)), 'hex')
}

export function channelTopics(key) {
  assertKey(key)
  return {
    replication: H('topic/channel-replication', key),
    chat: H('topic/channel-chat', key),
  }
}

/** Normalized public channel name, or '' when it does not follow v1 rules. */
export function normalizePublicChannelName(input) {
  const name = String(input || '')
    .trim()
    .toLowerCase()
  return PUBLIC_NAME_REGEX.test(name) ? name : ''
}

export function publicChannelKey(name) {
  const normalized = normalizePublicChannelName(name)
  if (!normalized) throw new TypeError('Invalid public channel name')
  return H('channel/public', normalized)
}

/** One-time migration from a v1 channel ID (channel-keys.md §7). */
export function legacyChannelKey(v1ChannelId) {
  const channelId = String(v1ChannelId || '')
    .trim()
    .toLowerCase()
  if (!channelId) throw new TypeError('v1 channel ID is required')
  return H('channel/legacy', channelId)
}

function toKey32(value) {
  if (typeof value === 'string' && HEX32_REGEX.test(value)) {
    return b4a.from(value, 'hex')
  }
  const bytes = value ? b4a.from(value) : null
  return bytes?.length === 32 ? bytes : null
}

export function createChannelProof({
  key,
  topic,
  challenge,
  proverPublicKey,
  verifierPublicKey,
}) {
  const parts = [topic, challenge, proverPublicKey, verifierPublicKey].map(
    toKey32
  )
  if (parts.some(part => !part)) return null
  const proofKey = KDF(assertKey(key), 'channel/proof-key')
  return MAC(proofKey, 'channel/proof', ...parts)
}

export function verifyChannelProof(input, proof) {
  const expected = createChannelProof(input)
  const actual = toKey32(proof)
  return Boolean(expected && actual && timingSafeEqual(expected, actual))
}

/** ed25519 key pair for this node's writer core in a channel (§6.1). */
export function channelWriterKeyPair(nodeSecret, channelIdHex, generation = 0) {
  if (!nodeSecret || nodeSecret.length !== 32) {
    throw new TypeError('Node secret must be 32 bytes')
  }
  if (!HEX32_REGEX.test(String(channelIdHex || ''))) {
    throw new TypeError('Channel ID must be 64 hex characters')
  }
  if (
    !Number.isInteger(generation) ||
    generation < 0 ||
    generation > 0xffffffff
  ) {
    throw new TypeError('Writer generation must be a uint32')
  }
  const counter = b4a.from([
    (generation >>> 24) & 255,
    (generation >>> 16) & 255,
    (generation >>> 8) & 255,
    generation & 255,
  ])
  const seed = MAC(
    nodeSecret,
    'channel/writer',
    b4a.from(channelIdHex, 'hex'),
    counter
  )
  const pair = nacl.sign.keyPair.fromSeed(seed)
  return {
    publicKey: b4a.from(pair.publicKey),
    secretKey: b4a.from(pair.secretKey),
  }
}

const LEGACY_RANDOM_ID_REGEX = /^[a-z2-7]{26}$/

/**
 * Resolves what a user typed or pasted to join a channel
 * (channel-keys.md §3, §4, §7):
 * - a 52-character credential: a private channel;
 * - a 26-character v1 random ID: the migrated v1 channel, so old links work;
 * - any other valid short name: a public channel anyone can derive.
 * `handle` is what the user shares; `channelKey` is the public channel ID.
 */
export function resolveChannelHandle(input) {
  const handle = String(input || '')
    .trim()
    .toLowerCase()
  const credentialKey = decodeChannelCredential(handle)
  if (credentialKey) {
    return channelHandleResult(handle, credentialKey, 'private')
  }
  if (LEGACY_RANDOM_ID_REGEX.test(handle)) {
    return channelHandleResult(handle, legacyChannelKey(handle), 'legacy')
  }
  if (normalizePublicChannelName(handle)) {
    return channelHandleResult(handle, publicChannelKey(handle), 'public')
  }
  return null
}

function channelHandleResult(handle, key, kind) {
  return { handle, kind, key, channelKey: channelIdFromKey(key) }
}
