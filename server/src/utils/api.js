import ky from 'ky'

const STORAGE_KEY = 'mostbox_backend_url'
const LOCALHOST_BACKEND_URL = 'http://localhost:1976'

function isLocalFrontendOrigin() {
  if (typeof window === 'undefined') return false

  return (
    ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    window.location.port === '3000'
  )
}

function getDefaultBackendUrl() {
  return isLocalFrontendOrigin() ? LOCALHOST_BACKEND_URL : ''
}

function getBackendUrl() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || getDefaultBackendUrl()
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`
}

function createApiInstance() {
  const url = getBackendUrl()
  return ky.create({
    prefix: url,
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

  if (!data.status && err instanceof Error && err.message) {
    return err.message
  }

  return fallback
}

export function setBackendUrl(url) {
  const cleaned = (url || '').trim().replace(/\/+$/, '')
  if (cleaned) {
    localStorage.setItem(STORAGE_KEY, cleaned)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  api = createApiInstance()
}

export function getBackendUrlExport() {
  return getBackendUrl()
}

export function getApiUrl(path) {
  const url = getBackendUrl()
  return `${url}${normalizePath(path)}`
}

export function getWebSocketUrl(path = '/ws') {
  if (typeof window === 'undefined') return normalizePath(path)

  const base = getBackendUrl() || window.location.origin
  const url = new URL(normalizePath(path), base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export async function checkBackendConnection() {
  const url = getBackendUrl()
  try {
    const res = await fetch(`${url}/api/node-id`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
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
