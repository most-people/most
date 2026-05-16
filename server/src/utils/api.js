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
