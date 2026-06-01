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

export function isPublicListenHost(listenHost) {
  const hostname = extractHostname(listenHost)
  if (!hostname) return false
  const value = hostname.toLowerCase()
  return value === '0.0.0.0' || value === '::' || !isLocalHostname(value)
}

function isExternalOrigin(origin) {
  if (!origin) return false
  const hostname = extractHostname(origin)
  if (!hostname) {
    return true
  }
  return !isLocalHostname(hostname)
}

function isLocalRequestHost(hostHeader) {
  const hostname = extractHostname(hostHeader)
  if (!hostname) {
    return false
  }
  return isLocalHostname(hostname)
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

export function isLocalRequest(c) {
  const host = c.req.header('host')
  if (host) {
    return isLocalRequestHost(host)
  }
  const clientIp =
    c.req.header('x-forwarded-for') ||
    c.env?.incoming?.socket?.remoteAddress ||
    ''
  return isLoopbackRemoteAddress(clientIp)
}

export function isLocalUpgradeRequest(req) {
  if (req.headers.host) {
    return isLocalRequestHost(req.headers.host)
  }
  return isLoopbackRemoteAddress(req.socket?.remoteAddress)
}

export function isRemoteAccessRequest({ invite, origin, listenHost, local }) {
  if (local) {
    return false
  }

  return (
    Boolean(invite) ||
    isExternalOrigin(origin) ||
    (isPublicListenHost(listenHost) && !local)
  )
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
