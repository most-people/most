import ky from 'ky'
import { buildAuthHeaders, normalizeAuthPath } from './auth.js'

const STORAGE_KEY = 'mostbox_backend_url'
const INVITE_STORAGE_KEY = 'mostbox_backend_invite'
const LOCALHOST_BACKEND_URL = 'http://localhost:1976'

function isLocalFrontendOrigin() {
  if (typeof window === 'undefined') return false

  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function getDefaultBackendUrl() {
  return isLocalFrontendOrigin() ? LOCALHOST_BACKEND_URL : ''
}

function getBackendUrl() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || getDefaultBackendUrl()
}

function getConfiguredBackendUrl() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || ''
}

function getRemoteBackendUrl() {
  const configured = getConfiguredBackendUrl()
  if (!configured) return ''
  try {
    const { hostname } = new URL(configured)
    return ['localhost', '127.0.0.1', '::1'].includes(hostname)
      ? ''
      : configured
  } catch {
    return configured
  }
}

function getBackendInvite() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(INVITE_STORAGE_KEY) || ''
}

function normalizeBackendUrl(url) {
  return (url || '').trim().replace(/\/+$/, '')
}

function isLocalBackendUrl(url) {
  const value = normalizeBackendUrl(url)
  if (!value) return false
  try {
    const { hostname } = new URL(value)
    const normalized = hostname.toLowerCase()
    return (
      normalized === 'localhost' ||
      normalized === '::1' ||
      normalized === '[::1]' ||
      normalized === '127.0.0.1' ||
      normalized.startsWith('127.')
    )
  } catch {
    return false
  }
}

function shouldAttachBackendInvite(url = getBackendUrl()) {
  return Boolean(getBackendInvite()) && !isLocalBackendUrl(url)
}

function getStoredIdentity() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('mostbox_identity')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`
}

function buildWebSocketUrl(base, wsPath = '/ws') {
  const url = new URL(base)
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = url.pathname.replace(/\/+$/, '')
  return `${wsProtocol}//${url.host}${basePath}${normalizePath(wsPath)}`
}

function createApiInstance() {
  const client = ky.create({
    hooks: {
      beforeRequest: [
        async ({ request }) => {
          const headers = new Headers(request.headers || {})
          const invite = getBackendInvite()
          if (invite && shouldAttachBackendInvite(request.url)) {
            headers.set('x-mostbox-invite', invite)
          }

          const identity = getStoredIdentity()
          if (identity?.danger) {
            try {
              const authHeaders = await buildAuthHeaders(
                identity,
                request.method,
                normalizeAuthPath(request.url)
              )
              for (const [key, value] of Object.entries(authHeaders)) {
                headers.set(key, value)
              }
            } catch {
              // Ignore invalid legacy identity data for public/backend probes.
            }
          }
          return new Request(request, { headers })
        },
      ],
    },
  })

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (!['get', 'post', 'put', 'patch', 'delete', 'head'].includes(prop)) {
        return value
      }
      return (input, options) => {
        const nextInput = typeof input === 'string' ? getApiUrl(input) : input
        return value.call(target, nextInput, options)
      }
    },
  })
}

export let api = createApiInstance()

export async function getApiErrorPayload(err) {
  const response =
    err && typeof err === 'object' && 'response' in err
      ? err.response
      : err instanceof Response
        ? err
        : null

  if (!response) return {}

  const data = response.bodyUsed
    ? null
    : await response
        .clone()
        .json()
        .catch(() => null)

  return {
    status: response.status,
    code: typeof data?.code === 'string' ? data.code : undefined,
    error:
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : undefined,
  }
}

export async function getApiErrorMessage(err, fallback = '请求失败') {
  const data = await getApiErrorPayload(err)
  if (data.error) return data.error

  const errorName =
    err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
  if (errorName === 'TimeoutError') return '请求超时，请稍后重试'

  if (err instanceof Error && err.message) {
    return err.message
  }

  return fallback
}

export function setBackendUrl(url) {
  const cleaned = normalizeBackendUrl(url)
  if (cleaned) {
    localStorage.setItem(STORAGE_KEY, cleaned)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  api = createApiInstance()
}

export function setBackendInvite(invite) {
  const cleaned = (invite || '').trim()
  if (cleaned) {
    localStorage.setItem(INVITE_STORAGE_KEY, cleaned)
  } else {
    localStorage.removeItem(INVITE_STORAGE_KEY)
  }
  api = createApiInstance()
}

export function configureBackend({ url, invite }) {
  setBackendUrl(url)
  setBackendInvite(invite)
}

export function clearBackendConnection() {
  setBackendUrl('')
  setBackendInvite('')
}

export function getBackendUrlExport() {
  return getBackendUrl()
}

export function getRemoteBackendUrlExport() {
  return getRemoteBackendUrl()
}

export function getBackendInviteExport() {
  return getBackendInvite()
}

export function getApiUrl(path) {
  const url = getBackendUrl()
  return `${url}${normalizePath(path)}`
}

export async function getApiRequestHeaders(method = 'GET', path = '/') {
  /** @type {Record<string, string>} */
  const headers = {}
  const invite = getBackendInvite()
  if (invite && shouldAttachBackendInvite()) {
    headers['x-mostbox-invite'] = invite
  }
  try {
    Object.assign(
      headers,
      await buildAuthHeaders(
        getStoredIdentity(),
        method,
        normalizeAuthPath(path)
      )
    )
  } catch {
    // Callers that require auth will receive the server's 401 response.
  }
  return headers
}

export function getWebSocketUrl(path = '/ws') {
  if (typeof window === 'undefined') return normalizePath(path)

  const base = getBackendUrl() || window.location.origin
  return buildWebSocketUrl(base, path)
}

export async function getAuthenticatedWebSocketUrl(path = '/ws') {
  if (typeof window === 'undefined') return normalizePath(path)

  const base = getBackendUrl() || window.location.origin
  const url = new URL(buildWebSocketUrl(base, path))

  const invite = getBackendInvite()
  if (invite && shouldAttachBackendInvite(url.toString())) {
    url.searchParams.set('invite', invite)
  }

  const identity = getStoredIdentity()
  if (identity?.danger) {
    try {
      const auth = await buildAuthHeaders(
        identity,
        'GET',
        normalizeAuthPath(path)
      )
      const [address, timestamp, signature] = String(
        auth.Authorization || ''
      ).split(',')
      if (address && signature) {
        url.searchParams.set('address', address)
        url.searchParams.set('timestamp', timestamp)
        url.searchParams.set('signature', signature)
      }
    } catch {
      // Leave WebSocket unauthenticated when local identity data is invalid.
    }
  }

  return url.toString()
}

export async function checkBackendConnection() {
  const url = getBackendUrl()
  const invite = shouldAttachBackendInvite(url) ? getBackendInvite() : ''
  return checkBackendConnectionTarget({ url, invite })
}

async function probeHttp(cleanedUrl, invite, identity) {
  try {
    const headers = {}
    if (invite) headers['x-mostbox-invite'] = invite
    try {
      Object.assign(
        headers,
        await buildAuthHeaders(identity, 'GET', '/api/remote/capabilities')
      )
    } catch {
      // Backend detection should still work when old identity data is invalid.
    }
    const res = await fetch(`${cleanedUrl}/api/remote/capabilities`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return { ok: false, reason: 'http' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'http' }
  }
}

async function probeWebSocket(cleanedUrl, invite, identity) {
  if (typeof WebSocket === 'undefined') return { ok: true }

  try {
    const wsUrl = new URL(buildWebSocketUrl(cleanedUrl))

    if (invite) {
      wsUrl.searchParams.set('invite', invite)
    }

    if (identity?.danger) {
      try {
        const auth = await buildAuthHeaders(
          identity,
          'GET',
          normalizeAuthPath('/ws')
        )
        const [address, timestamp, signature] = String(
          auth.Authorization || ''
        ).split(',')
        if (address && signature) {
          wsUrl.searchParams.set('address', address)
          wsUrl.searchParams.set('timestamp', timestamp)
          wsUrl.searchParams.set('signature', signature)
        }
      } catch {
        // Leave WebSocket unauthenticated when local identity data is invalid.
      }
    }

    return await new Promise(resolve => {
      const ws = new WebSocket(wsUrl.toString())
      const timeout = setTimeout(() => {
        ws.close()
        resolve({ ok: false, reason: 'ws' })
      }, 4000)

      ws.onopen = () => {
        clearTimeout(timeout)
        ws.close()
        resolve({ ok: true })
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        resolve({ ok: false, reason: 'ws' })
      }
    })
  } catch {
    return { ok: false, reason: 'ws' }
  }
}

export async function checkBackendConnectionTarget({ url, invite = '' }) {
  const cleanedUrl = normalizeBackendUrl(url)
  if (!cleanedUrl) return { ok: false, reason: 'http' }

  const identity = getStoredIdentity()

  const [httpResult, wsResult] = await Promise.all([
    probeHttp(cleanedUrl, invite, identity),
    probeWebSocket(cleanedUrl, invite, identity),
  ])

  if (!httpResult.ok) return httpResult
  if (!wsResult.ok) return wsResult
  return { ok: true }
}

export async function detectSameOriginBackend() {
  if (isLocalFrontendOrigin()) return false

  try {
    const res = await fetch('/api/node-id', {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function detectLocalhostBackend() {
  try {
    const res = await fetch(`${LOCALHOST_BACKEND_URL}/api/node-id`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}
