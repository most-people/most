const MOST_PROTOCOL_PREFIX = /^most:\/\//i
const PASSKEY_CALLBACK_HOST = 'passkey-callback'

export function findMostDeepLinkArg(argv = []) {
  return (
    argv.find(
      arg => typeof arg === 'string' && MOST_PROTOCOL_PREFIX.test(arg)
    ) || ''
  )
}

export function createCidRoutePathFromMostLink(link) {
  if (!link || typeof link !== 'string') return ''

  let url
  try {
    url = new URL(link)
  } catch {
    return ''
  }

  if (
    url.protocol !== 'most:' ||
    !url.hostname ||
    url.hostname === PASSKEY_CALLBACK_HOST
  ) {
    return ''
  }

  return `/cid/${encodeURIComponent(url.hostname)}${url.search}`
}

export function isPasskeyCallbackLink(link) {
  if (!link || typeof link !== 'string') return false

  try {
    const url = new URL(link)
    return (
      url.protocol === 'most:' &&
      url.hostname === PASSKEY_CALLBACK_HOST &&
      (url.pathname === '' || url.pathname === '/')
    )
  } catch {
    return false
  }
}

export function createMostDeepLinkTarget(link, baseUrl) {
  const routePath = createCidRoutePathFromMostLink(link)
  if (!routePath) return ''
  return new URL(routePath, baseUrl).toString()
}
