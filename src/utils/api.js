import ky from 'ky'

const STORAGE_KEY = 'mostbox_backend_url'

function getBackendUrl() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || ''
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
