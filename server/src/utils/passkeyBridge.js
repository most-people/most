import { getBytes, hexlify, randomBytes } from 'ethers'

import {
  most25519,
  mostBoxDecrypt,
  mostBoxEncrypt,
  parseMostBoxToken,
} from './mostWallet.js'

export const PASSKEY_BRIDGE_VERSION = '1'
export const PASSKEY_BRIDGE_PURPOSE = 'mostbox.passkey-lab.identity.v1'
export const PASSKEY_BRIDGE_MAX_AGE_MS = 5 * 60 * 1000
export const PASSKEY_CALLBACK_HOST = 'passkey-callback'
export const PASSKEY_LAB_URL = 'https://most.box/passkey-lab/'

const BRIDGE_MODES = new Set(['create', 'authenticate'])
const CALLBACK_FIELDS = new Set(['v', 'state', 'senderPublicKey', 'token'])

function hasExactQueryFields(url, fields) {
  const seen = new Set()
  for (const key of url.searchParams.keys()) {
    if (!fields.has(key) || seen.has(key)) return false
    seen.add(key)
  }
  return seen.size === fields.size
}

function isHexBytes(value, length) {
  try {
    return getBytes(value).length === length
  } catch {
    return false
  }
}

export function isPasskeyBridgeMode(value) {
  return BRIDGE_MODES.has(value)
}

export function createPasskeyBridgeRequest({ now = Date.now() } = {}) {
  const recipientPrivateKey = hexlify(randomBytes(32))
  const { public_key: recipientPublicKey } = most25519(recipientPrivateKey)

  return {
    version: PASSKEY_BRIDGE_VERSION,
    state: hexlify(randomBytes(32)),
    recipientPrivateKey,
    recipientPublicKey,
    createdAt: now,
    used: false,
  }
}

export function buildPasskeyLabBridgeUrl(request, mode) {
  if (!isPasskeyBridgeMode(mode)) {
    throw new TypeError('Unsupported passkey bridge mode')
  }
  if (
    request.version !== PASSKEY_BRIDGE_VERSION ||
    !isHexBytes(request.state, 32) ||
    !isHexBytes(request.recipientPublicKey, 32)
  ) {
    throw new TypeError('Invalid passkey bridge request')
  }

  const url = new URL(PASSKEY_LAB_URL)
  url.searchParams.set('bridge', 'native')
  url.searchParams.set('mode', mode)
  url.searchParams.set('v', PASSKEY_BRIDGE_VERSION)
  url.searchParams.set('state', request.state)
  url.searchParams.set('recipientPublicKey', request.recipientPublicKey)
  return url.toString()
}

export function parsePasskeyLabBridgeRequest(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const mode = url.searchParams.get('mode') || ''
  const state = url.searchParams.get('state') || ''
  const recipientPublicKey = url.searchParams.get('recipientPublicKey') || ''
  if (
    url.origin !== 'https://most.box' ||
    url.pathname !== '/passkey-lab/' ||
    url.searchParams.get('bridge') !== 'native' ||
    url.searchParams.get('v') !== PASSKEY_BRIDGE_VERSION ||
    !isPasskeyBridgeMode(mode) ||
    !isHexBytes(state, 32) ||
    !isHexBytes(recipientPublicKey, 32)
  ) {
    return null
  }

  return {
    version: PASSKEY_BRIDGE_VERSION,
    mode,
    state,
    recipientPublicKey,
  }
}

export function createPasskeyBridgeCallback({
  state,
  recipientPublicKey,
  danger,
  credentialId,
}) {
  if (
    !isHexBytes(state, 32) ||
    !isHexBytes(recipientPublicKey, 32) ||
    !isHexBytes(danger, 32)
  ) {
    throw new TypeError('Invalid passkey bridge response')
  }

  const senderPrivateKey = hexlify(randomBytes(32))
  const { public_key: senderPublicKey } = most25519(senderPrivateKey)
  const plaintext = JSON.stringify({
    v: PASSKEY_BRIDGE_VERSION,
    state,
    purpose: PASSKEY_BRIDGE_PURPOSE,
    danger,
    credentialId,
  })
  const token = mostBoxEncrypt(plaintext, {
    senderPrivateKey,
    recipientPublicKey,
  })
  const callback = new URL(`most://${PASSKEY_CALLBACK_HOST}`)
  callback.searchParams.set('v', PASSKEY_BRIDGE_VERSION)
  callback.searchParams.set('state', state)
  callback.searchParams.set('senderPublicKey', senderPublicKey)
  callback.searchParams.set('token', token)
  return callback.toString()
}

export function parsePasskeyBridgeCallback(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const state = url.searchParams.get('state') || ''
  const senderPublicKey = url.searchParams.get('senderPublicKey') || ''
  const token = url.searchParams.get('token') || ''
  if (
    url.protocol !== 'most:' ||
    url.hostname !== PASSKEY_CALLBACK_HOST ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.searchParams.get('v') !== PASSKEY_BRIDGE_VERSION ||
    !hasExactQueryFields(url, CALLBACK_FIELDS) ||
    !isHexBytes(state, 32) ||
    !isHexBytes(senderPublicKey, 32) ||
    !parseMostBoxToken(token)
  ) {
    return null
  }

  return {
    version: PASSKEY_BRIDGE_VERSION,
    state,
    senderPublicKey,
    token,
  }
}

export function consumePasskeyBridgeCallback(
  value,
  pending,
  { now = Date.now(), maxAgeMs = PASSKEY_BRIDGE_MAX_AGE_MS } = {}
) {
  if (!pending || pending.used) {
    throw new Error('PASSKEY_BRIDGE_REPLAYED')
  }
  if (now < pending.createdAt || now - pending.createdAt > maxAgeMs) {
    throw new Error('PASSKEY_BRIDGE_EXPIRED')
  }

  const callback = parsePasskeyBridgeCallback(value)
  if (!callback || callback.state !== pending.state) {
    throw new Error('PASSKEY_BRIDGE_INVALID_CALLBACK')
  }

  const token = parseMostBoxToken(callback.token)
  if (
    !token ||
    token.timestampMs < pending.createdAt ||
    token.timestampMs > now + 30_000 ||
    now - token.timestampMs > maxAgeMs
  ) {
    throw new Error('PASSKEY_BRIDGE_EXPIRED')
  }

  const plaintext = mostBoxDecrypt(callback.token, {
    senderPublicKey: callback.senderPublicKey,
    recipientPrivateKey: pending.recipientPrivateKey,
  })
  if (!plaintext) {
    throw new Error('PASSKEY_BRIDGE_DECRYPT_FAILED')
  }

  let payload
  try {
    payload = JSON.parse(plaintext)
  } catch {
    throw new Error('PASSKEY_BRIDGE_INVALID_PAYLOAD')
  }
  if (
    payload.v !== PASSKEY_BRIDGE_VERSION ||
    payload.state !== pending.state ||
    payload.purpose !== PASSKEY_BRIDGE_PURPOSE ||
    !isHexBytes(payload.danger, 32) ||
    typeof payload.credentialId !== 'string' ||
    !payload.credentialId
  ) {
    throw new Error('PASSKEY_BRIDGE_INVALID_PAYLOAD')
  }

  pending.used = true
  return {
    danger: payload.danger,
    credentialId: payload.credentialId,
  }
}
