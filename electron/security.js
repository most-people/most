const LOCAL_APP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isTrustedAppUrl(value, port = 1976) {
  const url = parseUrl(value)
  return Boolean(
    url &&
    url.protocol === 'http:' &&
    LOCAL_APP_HOSTS.has(url.hostname) &&
    url.port === String(port) &&
    !url.username &&
    !url.password
  )
}

export function isSafeExternalUrl(value) {
  const url = parseUrl(value)
  return Boolean(
    url &&
    url.protocol === 'https:' &&
    url.hostname &&
    !url.username &&
    !url.password
  )
}

export function isAllowedExternalHost(value, allowedHosts) {
  if (!isSafeExternalUrl(value)) return false

  const url = new URL(value)
  const normalizedHosts = new Set(
    [...allowedHosts].map(host => String(host).toLowerCase())
  )
  return normalizedHosts.has(url.hostname.toLowerCase())
}
