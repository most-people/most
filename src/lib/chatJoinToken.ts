import nacl from 'tweetnacl'

const TOKEN_KEY_BYTES = nacl.secretbox.keyLength
const TOKEN_NONCE_BYTES = nacl.secretbox.nonceLength
const TOKEN_MIN_BYTES =
  TOKEN_KEY_BYTES + TOKEN_NONCE_BYTES + nacl.secretbox.overheadLength
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

type RandomBytes = (length: number) => Uint8Array

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodeBase64Url(value: string) {
  const token = String(value || '').trim()
  if (!TOKEN_PATTERN.test(token)) return null

  try {
    const standard = token
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(token.length / 4) * 4, '=')
    const binary = atob(standard)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

function createRandomBytes(length: number) {
  return nacl.randomBytes(length)
}

export function encryptChatJoinToken(
  payload: unknown,
  randomBytes: RandomBytes = createRandomBytes
) {
  const key = randomBytes(TOKEN_KEY_BYTES)
  const nonce = randomBytes(TOKEN_NONCE_BYTES)
  if (key.length !== TOKEN_KEY_BYTES || nonce.length !== TOKEN_NONCE_BYTES) {
    throw new Error('Invalid chat invite random byte source')
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = nacl.secretbox(plaintext, nonce, key)
  return encodeBase64Url(concatBytes([key, nonce, encrypted]))
}

export function decryptChatJoinToken(token: string): unknown | null {
  const bytes = decodeBase64Url(token)
  if (!bytes || bytes.length < TOKEN_MIN_BYTES) return null

  const key = bytes.slice(0, TOKEN_KEY_BYTES)
  const nonce = bytes.slice(
    TOKEN_KEY_BYTES,
    TOKEN_KEY_BYTES + TOKEN_NONCE_BYTES
  )
  const encrypted = bytes.slice(TOKEN_KEY_BYTES + TOKEN_NONCE_BYTES)
  const plaintext = nacl.secretbox.open(encrypted, nonce, key)
  if (!plaintext) return null

  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
  } catch {
    return null
  }
}

export function getChatJoinTokenFromHash(hash: string) {
  const token = String(hash || '')
    .replace(/^#/, '')
    .trim()
  return TOKEN_PATTERN.test(token) ? token : ''
}

export function parseChatJoinTokenInput(
  input: string,
  baseUrl = 'https://most.box'
) {
  const value = String(input || '').trim()
  if (!value) return ''
  if (value.startsWith('#')) return getChatJoinTokenFromHash(value)
  if (TOKEN_PATTERN.test(value)) return value

  try {
    return getChatJoinTokenFromHash(new URL(value, baseUrl).hash)
  } catch {
    return ''
  }
}

export function buildChatJoinPath(token: string) {
  const normalized = parseChatJoinTokenInput(token)
  if (!normalized) throw new Error('Invalid chat invite token')
  return `/chat/join#${normalized}`
}

export function buildChatJoinUrl(token: string, origin: string) {
  return `${String(origin || '').replace(/\/$/, '')}${buildChatJoinPath(token)}`
}
