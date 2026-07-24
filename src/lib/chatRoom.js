export const CHANNEL_ID_MIN_LENGTH = 3
export const CHANNEL_ID_MAX_LENGTH = 30
export const CHANNEL_ID_REGEX = /^[a-z0-9_-]+$/

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function encodeBase32(bytes) {
  let result = ''
  const bitLength = bytes.length * 8

  for (let bitOffset = 0; bitOffset < bitLength; bitOffset += 5) {
    let value = 0
    for (let bit = 0; bit < 5; bit += 1) {
      const sourceBit = bitOffset + bit
      value <<= 1
      if (sourceBit < bitLength) {
        value |= (bytes[Math.floor(sourceBit / 8)] >> (7 - (sourceBit % 8))) & 1
      }
    }
    result += BASE32_ALPHABET[value]
  }

  return result
}

export function normalizeChatChannelId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
}

export function createRandomChannelId(getRandomValues) {
  const fillRandomValues =
    getRandomValues ||
    globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)
  if (!fillRandomValues) {
    throw new Error('Secure random number generation is unavailable')
  }

  const bytes = new Uint8Array(16)
  fillRandomValues(bytes)
  return encodeBase32(bytes)
}

export function getChannelIdFromHash(hash) {
  const encodedId = String(hash || '').replace(/^#/, '')
  if (!encodedId) return ''

  try {
    return normalizeChatChannelId(decodeURIComponent(encodedId))
  } catch {
    return ''
  }
}

export function parseChatChannelInput(value, baseUrl = 'http://localhost') {
  const input = String(value || '').trim()
  if (!input) return ''
  if (input.startsWith('#')) return getChannelIdFromHash(input)

  if (input.includes('://') || input.startsWith('/')) {
    try {
      const url = new URL(input, baseUrl)
      const pathname = url.pathname.replace(/\/+$/, '')
      if (pathname !== '/chat') return ''
      return getChannelIdFromHash(url.hash)
    } catch {
      return ''
    }
  }

  return normalizeChatChannelId(input)
}

export function buildChatSharePath(channelId) {
  return `/chat/#${encodeURIComponent(normalizeChatChannelId(channelId))}`
}

export function buildChatShareUrl(channelId, origin) {
  return `${String(origin || '').replace(/\/$/, '')}${buildChatSharePath(channelId)}`
}
