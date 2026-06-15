const MOST_PROTOCOL_PREFIX = /^most:\/\//i

export function findMostDeepLinkArg(argv = []) {
  return (
    argv.find(arg => typeof arg === 'string' && MOST_PROTOCOL_PREFIX.test(arg)) ||
    ''
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

  if (url.protocol !== 'most:' || !url.hostname) return ''

  return `/cid/${encodeURIComponent(url.hostname)}${url.search}`
}

export function createMostDeepLinkTarget(link, baseUrl) {
  const routePath = createCidRoutePathFromMostLink(link)
  if (!routePath) return ''
  return new URL(routePath, baseUrl).toString()
}
