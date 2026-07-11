const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://most.box',
  'https://most-people.com',
]

export function getAllowedOrigins(appPort) {
  return [
    ...new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      `http://localhost:${appPort}`,
      `http://127.0.0.1:${appPort}`,
    ]),
  ]
}

export function isAllowedOrigin(origin, allowedOrigins = []) {
  const input = String(origin || '').trim()
  if (!input) return true

  try {
    const normalized = new URL(input).origin
    return allowedOrigins.some(value => {
      try {
        return new URL(value).origin === normalized
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export function isAllowedRequestOrigin(
  origin,
  allowedOrigins = [],
  hostHeader = ''
) {
  const input = String(origin || '').trim()
  if (!input || isAllowedOrigin(input, allowedOrigins)) return true

  try {
    const originUrl = new URL(input)
    const requestUrl = new URL(`http://${String(hostHeader || '').trim()}`)
    return originUrl.host.toLowerCase() === requestUrl.host.toLowerCase()
  } catch {
    return false
  }
}

export function getRequestPath(c) {
  return new URL(c.req.url).pathname
}

function extractHostname(value) {
  const input = String(value || '').trim()
  if (!input) return ''

  try {
    return new URL(input.includes('://') ? input : `http://${input}`).hostname
  } catch {
    return ''
  }
}

function isLocalHostname(hostname) {
  const value = String(hostname || '')
    .trim()
    .toLowerCase()
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(value)
}

function normalizeNetworkAddress(address) {
  const value = String(address || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')

  if (value.startsWith('::ffff:')) {
    return value.slice('::ffff:'.length)
  }

  return value
}

export function isPrivateNetworkHostname(hostname) {
  const value = normalizeNetworkAddress(hostname)

  if (value === '::1' || value === 'localhost') {
    return true
  }

  if (
    value.includes(':') &&
    (value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80:'))
  ) {
    return true
  }

  const parts = value.split('.').map(part => Number(part))
  if (
    parts.length !== 4 ||
    parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }

  const [first, second] = parts
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

export function isPublicListenHost(listenHost) {
  const hostname = extractHostname(listenHost)
  if (!hostname) return false
  const value = hostname.toLowerCase()
  return value === '0.0.0.0' || value === '::' || !isLocalHostname(value)
}

function isTrustedRequestHost(hostHeader, trustPrivateNetwork = false) {
  const hostname = extractHostname(hostHeader)
  if (!hostname) {
    return false
  }
  return (
    isLocalHostname(hostname) ||
    (trustPrivateNetwork && isPrivateNetworkHostname(hostname))
  )
}

export function isLoopbackRemoteAddress(address) {
  const value = String(address || '')
    .trim()
    .toLowerCase()
  return (
    value === 'localhost' ||
    value === '::1' ||
    value === '::ffff:localhost' ||
    value === '127.0.0.1' ||
    value === '::ffff:127.0.0.1' ||
    value.startsWith('127.') ||
    value.startsWith('::ffff:127.')
  )
}

export function isLocalRequest(c, options = {}) {
  const host = c.req.header('host')
  const clientIp = c.env?.incoming?.socket?.remoteAddress || ''
  const trustedClient =
    isLoopbackRemoteAddress(clientIp) ||
    (options.trustPrivateNetwork === true && isPrivateNetworkHostname(clientIp))
  return (
    trustedClient &&
    isTrustedRequestHost(host, options.trustPrivateNetwork === true)
  )
}

export function isLocalUpgradeRequest(req, options = {}) {
  const remoteAddress = req.socket?.remoteAddress
  const trustedClient =
    isLoopbackRemoteAddress(remoteAddress) ||
    (options.trustPrivateNetwork === true &&
      isPrivateNetworkHostname(remoteAddress))
  return (
    trustedClient &&
    isTrustedRequestHost(req.headers.host, options.trustPrivateNetwork === true)
  )
}

export function isRemoteAccessRequest({
  origin,
  host,
  local,
  allowedOrigins = [],
}) {
  if (!isAllowedRequestOrigin(origin, allowedOrigins, host)) return true
  return !local
}

export function remoteInviteConfigured(inviteSet) {
  return inviteSet.size > 0
}

export function hasValidInvite(inviteSet, invite) {
  const code = String(invite || '').trim()
  return remoteInviteConfigured(inviteSet) && code && inviteSet.has(code)
}

export function getInvalidInviteResponse(c) {
  return c.json(
    {
      error: 'Remote node invite required',
      code: 'INVALID_INVITE',
    },
    403
  )
}
