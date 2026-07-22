export const CHANNEL_ID_MIN_LENGTH = 3
export const CHANNEL_ID_MAX_LENGTH = 30
export const CHANNEL_ID_REGEX = /^[A-Za-z0-9_-]+$/

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function encodeBase64Url(bytes) {
  let result = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second || 0) << 8) | (third || 0)

    result += BASE64URL_ALPHABET[(block >> 18) & 63]
    result += BASE64URL_ALPHABET[(block >> 12) & 63]
    if (index + 1 < bytes.length) {
      result += BASE64URL_ALPHABET[(block >> 6) & 63]
    }
    if (index + 2 < bytes.length) {
      result += BASE64URL_ALPHABET[block & 63]
    }
  }

  return result
}

export function createRandomChannelId(getRandomValues) {
  const fillRandomValues =
    getRandomValues ||
    globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)
  if (!fillRandomValues) {
    throw new Error('Secure random number generation is unavailable')
  }

  return encodeBase64Url(fillRandomValues(new Uint8Array(16)))
}

export function getChannelIdFromHash(hash) {
  const encodedId = String(hash || '').replace(/^#/, '')
  if (!encodedId) return ''

  try {
    return decodeURIComponent(encodedId).trim()
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

  return input
}

export function buildChatSharePath(channelId) {
  return `/chat/#${encodeURIComponent(channelId)}`
}

export function buildChatShareUrl(channelId, origin) {
  return `${String(origin || '').replace(/\/$/, '')}${buildChatSharePath(channelId)}`
}
