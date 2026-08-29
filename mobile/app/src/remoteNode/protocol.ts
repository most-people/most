import type { MobileIdentity } from '../mobileCore/types'
import { buildMobileAuthHeader, normalizeAuthPath } from './identity'
import {
  getRemoteUrlCandidates,
  hasExplicitRemoteUrlProtocol,
  normalizeRemoteUrl,
} from './connectionHistory'

const REMOTE_DETECTION_TIMEOUT_MS = 3_000

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

function isMostBoxCapabilities(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    typeof data.remoteAccess === 'boolean' &&
    typeof data.inviteRequired === 'boolean' &&
    typeof data.adminAvailable === 'boolean' &&
    typeof data.listenHost === 'string'
  )
}

async function detectsMostBoxEndpoint(
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${baseUrl}/api/remote/capabilities`, {
      method: 'GET',
      signal: controller.signal,
    })
    const payload = (await response
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null
    return (
      isMostBoxCapabilities(payload) ||
      (response.status === 403 && payload?.code === 'INVALID_INVITE')
    )
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveRemoteUrl(
  value: string,
  options: {
    fetchImpl?: typeof fetch
    timeoutMs?: number
  } = {}
) {
  const candidates = getRemoteUrlCandidates(value)
  if (candidates.length === 0) throw new Error('Enter a valid node URL')
  if (hasExplicitRemoteUrlProtocol(value)) return candidates[0]

  const fetchImpl = options.fetchImpl || fetch
  const timeoutMs = options.timeoutMs || REMOTE_DETECTION_TIMEOUT_MS
  for (const candidate of candidates) {
    if (await detectsMostBoxEndpoint(candidate, fetchImpl, timeoutMs)) {
      return candidate
    }
  }

  const error = new Error(
    'Remote node HTTP endpoint is unreachable'
  ) as Error & {
    code?: string
  }
  error.code = 'REMOTE_HTTP_UNREACHABLE'
  throw error
}

export function buildRemoteApiUrl(baseUrl: string, path: string) {
  const base = normalizeRemoteUrl(baseUrl)
  if (!base) throw new Error('Enter a valid node URL')
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
