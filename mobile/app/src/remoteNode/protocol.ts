import type { MobileIdentity } from '../mobileCore/types'
import { buildMobileAuthHeader, normalizeAuthPath } from './identity'
import { normalizeRemoteUrl } from './connectionHistory'

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

export function buildRemoteApiUrl(baseUrl: string, path: string) {
  const base = normalizeRemoteUrl(baseUrl)
  if (!base) throw new Error('Enter a valid HTTP or HTTPS node URL')
  return `${base}${normalizePath(path)}`
}

export function getRemoteAuthPath(baseUrl: string, requestUrl: string) {
  const requestPath = normalizeAuthPath(requestUrl)
  try {
    const basePath = new URL(normalizeRemoteUrl(baseUrl)).pathname.replace(
      /\/+$/,
      ''
    )
    if (!basePath || basePath === '/') return requestPath
    if (requestPath === basePath) return '/'
    if (requestPath.startsWith(`${basePath}/`)) {
      return requestPath.slice(basePath.length)
    }
  } catch {}
  return requestPath
}

export function buildRemoteWebSocketUrl(baseUrl: string, path = '/ws') {
  const base = new URL(normalizeRemoteUrl(baseUrl))
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.pathname = `${base.pathname.replace(/\/+$/, '')}${normalizePath(path)}`
  base.search = ''
  base.hash = ''
  return base
}

export async function buildRemoteHeaders(input: {
  baseUrl: string
  invite: string
  identity: MobileIdentity | null
  method: string
  path: string
}) {
  const headers: Record<string, string> = {}
  if (input.invite.trim()) {
    headers['x-mostbox-invite'] = input.invite.trim()
  }
  const requestUrl = buildRemoteApiUrl(input.baseUrl, input.path)
  const authorization = await buildMobileAuthHeader(
    input.identity,
    input.method,
    getRemoteAuthPath(input.baseUrl, requestUrl)
  )
  if (authorization) headers.Authorization = authorization
  return headers
}

export async function buildAuthenticatedWebSocketUrl(input: {
  baseUrl: string
  invite: string
  identity: MobileIdentity | null
}) {
  const url = buildRemoteWebSocketUrl(input.baseUrl)
  if (input.invite.trim()) url.searchParams.set('invite', input.invite.trim())
  const authorization = await buildMobileAuthHeader(
    input.identity,
    'GET',
    '/ws'
  )
  if (authorization) {
    const [address, timestamp, signature] = authorization.split(',')
    url.searchParams.set('address', address)
    url.searchParams.set('timestamp', timestamp)
    url.searchParams.set('signature', signature)
  }
  return url.toString()
}
