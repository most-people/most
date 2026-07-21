import { id, verifyMessage } from 'ethers'
import {
  most25519,
  mostBoxDecrypt,
  mostBoxDecryptSent,
  mostBoxEncrypt,
  mostSignMessage,
  parseMostBoxToken,
} from '../utils/mostWallet.js'

export const DIRECT_CHANNEL_TYPE = 'direct'
export const DIRECT_INBOX_CHANNEL_TYPE = 'direct-inbox'
export const DIRECT_KEY_ENVELOPE_TYPE = 'most.direct.key'
export const DIRECT_VOICE_ENVELOPE_TYPE = 'most.direct.voice'
export const DIRECT_PROTOCOL_VERSION = 1
export const DIRECT_MESSAGE_MAX_LENGTH = 7000
export const DIRECT_MESSAGE_MAX_CIPHERTEXT_LENGTH = 40000
export const DIRECT_VOICE_MAX_CIPHERTEXT_LENGTH = 60 * 1024

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const PUBLIC_KEY_REGEX = /^0x[a-fA-F0-9]{64}$/
const DIRECT_CHANNEL_REGEX = /^direct\.[a-f0-9]{64}$/
const DIRECT_INBOX_CHANNEL_REGEX = /^direct-inbox\.[a-f0-9]{40}$/

export function normalizeDirectAddress(value) {
  const address = String(value || '').trim()
  return ADDRESS_REGEX.test(address) ? address.toLowerCase() : ''
}

export function buildDirectInboxChannelId(address) {
  const normalized = normalizeDirectAddress(address)
  if (!normalized) throw new TypeError('Invalid direct chat address')
  return `direct-inbox.${normalized.slice(2)}`
}

export function buildDirectChannelId(firstAddress, secondAddress) {
  const first = normalizeDirectAddress(firstAddress)
  const second = normalizeDirectAddress(secondAddress)
  if (!first || !second || first === second) {
    throw new TypeError('Direct chat requires two different valid addresses')
  }
  const pair = [first, second].sort().join(':')
  return `direct.${id(`mostbox-direct-v1:${pair}`).slice(2)}`
}

export function isDirectSystemChannel(channelId, type) {
  const value = String(channelId || '').trim()
  if (type === DIRECT_CHANNEL_TYPE) return DIRECT_CHANNEL_REGEX.test(value)
  if (type === DIRECT_INBOX_CHANNEL_TYPE) {
    return DIRECT_INBOX_CHANNEL_REGEX.test(value)
  }
  return false
}

export function isDirectMessageCiphertext(value) {
  return Boolean(parseMostBoxToken(String(value || '').trim()))
}

export function getDirectKeyProofMessage({
  fromAddress,
  toAddress,
  publicKey,
  displayName = '',
}) {
  const from = normalizeDirectAddress(fromAddress)
  const to = normalizeDirectAddress(toAddress)
  const key = String(publicKey || '')
    .trim()
    .toLowerCase()
  if (!from || !to || from === to || !PUBLIC_KEY_REGEX.test(key)) {
    throw new TypeError('Invalid direct chat key proof')
  }
  const name = String(displayName || '')
    .trim()
    .slice(0, 50)
  return `MostBox direct key v1\nfrom:${from}\nto:${to}\nkey:${key}\nname:${JSON.stringify(name)}`
}

export async function createDirectKeyEnvelope(identity, toAddress) {
  const fromAddress = normalizeDirectAddress(identity?.address)
  const to = normalizeDirectAddress(toAddress)
  if (!identity?.danger || !fromAddress || !to || fromAddress === to) {
    throw new TypeError('Invalid direct chat identity or recipient')
  }

  const publicKey = most25519(identity.danger).public_key.toLowerCase()
  const displayName = String(identity.displayName || identity.username || '')
    .trim()
    .slice(0, 50)
  const proof = getDirectKeyProofMessage({
    fromAddress,
    toAddress: to,
    publicKey,
    displayName,
  })
  const signed = await mostSignMessage(identity.danger, proof)

  return {
    type: DIRECT_KEY_ENVELOPE_TYPE,
    version: DIRECT_PROTOCOL_VERSION,
    fromAddress,
    toAddress: to,
    publicKey,
    displayName,
    signature: signed.signature,
  }
}

export function verifyDirectKeyEnvelope(input, expectedRecipient = '') {
  let envelope = input
  if (typeof envelope === 'string') {
    try {
      envelope = JSON.parse(envelope)
    } catch {
      return null
    }
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return null
  }

  const fromAddress = normalizeDirectAddress(envelope.fromAddress)
  const toAddress = normalizeDirectAddress(envelope.toAddress)
  const expected = normalizeDirectAddress(expectedRecipient)
  const publicKey = String(envelope.publicKey || '')
    .trim()
    .toLowerCase()
  const displayName = String(envelope.displayName || '')
    .trim()
    .slice(0, 50)
  if (
    envelope.type !== DIRECT_KEY_ENVELOPE_TYPE ||
    envelope.version !== DIRECT_PROTOCOL_VERSION ||
    !fromAddress ||
    !toAddress ||
    fromAddress === toAddress ||
    (expected && toAddress !== expected) ||
    !PUBLIC_KEY_REGEX.test(publicKey) ||
    typeof envelope.signature !== 'string'
  ) {
    return null
  }

  try {
    const recovered = normalizeDirectAddress(
      verifyMessage(
        getDirectKeyProofMessage({
          fromAddress,
          toAddress,
          publicKey,
          displayName,
        }),
        envelope.signature
      )
    )
    if (recovered !== fromAddress) return null
  } catch {
    return null
  }

  return {
    type: DIRECT_KEY_ENVELOPE_TYPE,
    version: DIRECT_PROTOCOL_VERSION,
    fromAddress,
    toAddress,
    publicKey,
    displayName,
    signature: envelope.signature,
  }
}

export function encryptDirectMessage(text, identity, recipientPublicKey) {
  const plaintext = String(text || '').trim()
  if (!identity?.danger || !plaintext) return ''
  if ([...plaintext].length > DIRECT_MESSAGE_MAX_LENGTH) {
    throw new RangeError('Direct message is too long')
  }
  const keys = most25519(identity.danger)
  const ciphertext = mostBoxEncrypt(plaintext, {
    senderPrivateKey: keys.private_key,
    recipientPublicKey,
  })
  if (ciphertext.length > DIRECT_MESSAGE_MAX_CIPHERTEXT_LENGTH) {
    throw new RangeError('Encrypted direct message is too long')
  }
  return ciphertext
}

export function decryptDirectMessage(
  ciphertext,
  { identity, peerPublicKey, authorAddress }
) {
  if (!identity?.danger || !peerPublicKey) return ''
  const selfAddress = normalizeDirectAddress(identity.address)
  const author = normalizeDirectAddress(authorAddress)
  if (!selfAddress || !author) return ''

  const keys = most25519(identity.danger)
  if (author === selfAddress) {
    return mostBoxDecryptSent(ciphertext, {
      senderPrivateKey: keys.private_key,
      recipientPublicKey: peerPublicKey,
    })
  }
  return mostBoxDecrypt(ciphertext, {
    senderPublicKey: peerPublicKey,
    recipientPrivateKey: keys.private_key,
  })
}

export function encryptDirectVoiceEvent(event, identity, recipientPublicKey) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return ''
  if (!identity?.danger || !recipientPublicKey) return ''

  const keys = most25519(identity.danger)
  const ciphertext = mostBoxEncrypt(
    JSON.stringify({
      type: DIRECT_VOICE_ENVELOPE_TYPE,
      version: DIRECT_PROTOCOL_VERSION,
      payload: event,
    }),
    {
      senderPrivateKey: keys.private_key,
      recipientPublicKey,
    }
  )
  if (ciphertext.length > DIRECT_VOICE_MAX_CIPHERTEXT_LENGTH) {
    throw new RangeError('Encrypted direct voice event is too long')
  }
  return ciphertext
}

export function decryptDirectVoiceEvent(
  ciphertext,
  { identity, peerPublicKey, authorAddress }
) {
  const plaintext = decryptDirectMessage(ciphertext, {
    identity,
    peerPublicKey,
    authorAddress,
  })
  if (!plaintext) return null

  try {
    const envelope = JSON.parse(plaintext)
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      Array.isArray(envelope) ||
      envelope.type !== DIRECT_VOICE_ENVELOPE_TYPE ||
      envelope.version !== DIRECT_PROTOCOL_VERSION ||
      !envelope.payload ||
      typeof envelope.payload !== 'object' ||
      Array.isArray(envelope.payload)
    ) {
      return null
    }
    return envelope.payload
  } catch {
    return null
  }
}
