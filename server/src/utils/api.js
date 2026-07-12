import ky from 'ky'
import { buildAuthHeaders, normalizeAuthPath } from './auth.js'

const STORAGE_KEY = 'mostbox_backend_url'
const INVITE_STORAGE_KEY = 'mostbox_backend_invite'
const REMOTE_NODES_KEY = 'mostbox_remote_nodes'
const LOCALHOST_BACKEND_URL = 'http://localhost:1976'
const MAX_REMOTE_NODES = 8
let currentApiIdentity = null

export function setCurrentApiIdentity(identity) {
  currentApiIdentity =
    identity && typeof identity === 'object' ? identity : null
}

function isLocalFrontendOrigin() {
  if (typeof window === 'undefined') return false

  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function getDefaultBackendUrl() {
  return isLocalFrontendOrigin() ? LOCALHOST_BACKEND_URL : ''
}

function getSameOriginBackendUrl() {
  if (typeof window === 'undefined') return ''
  return window.location.origin || ''
}

function getBackendUrl() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || getDefaultBackendUrl()
}

function getConfiguredBackendUrl() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || ''
}

function isRemoteBackendUrl(url) {
  const configured = normalizeBackendUrl(url)
  if (!configured) return false

  try {
    const { hostname } = new URL(configured)
    const normalized = hostname.toLowerCase()
    return !(
      normalized === 'localhost' ||
      normalized === '::1' ||
      normalized === '[::1]' ||
      normalized === '127.0.0.1' ||
      normalized.startsWith('127.')
    )
  } catch {
    return true
  }
}

function getBackendInvite() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(INVITE_STORAGE_KEY) || ''
}

function normalizeRemoteNode(input, fallback = {}) {
  if (!input || typeof input !== 'object') return null

  const url = normalizeBackendUrl(input.url)
  if (!isRemoteBackendUrl(url)) return null

  return {
    url,
    invite: typeof input.invite === 'string' ? input.invite.trim() : '',
    active: input.active === true || fallback.active === true,
    updatedAt: Number(input.updatedAt || fallback.updatedAt || Date.now()),
  }
}

function uniqueRemoteNodes(nodes) {
  const byUrl = new Map()
  let activeUrl = ''

  for (const node of nodes) {
    const normalized = normalizeRemoteNode(node)
    if (!normalized) continue

    if (normalized.active && !activeUrl) {
      activeUrl = normalized.url
    } else if (normalized.active && activeUrl !== normalized.url) {
      normalized.active = false
    }

    const existing = byUrl.get(normalized.url)
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      byUrl.set(normalized.url, {
        ...existing,
        ...normalized,
        active: normalized.active || existing?.active === true,
      })
    }
  }

  return [...byUrl.values()]
    .map(node => ({
      ...node,
      active: node.url === activeUrl || (!activeUrl && node.active === true),
    }))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
    .slice(0, MAX_REMOTE_NODES)
}

function getRemoteNodes() {
  if (typeof window === 'undefined') return []

  const parsed = parseJsonText(localStorage.getItem(REMOTE_NODES_KEY))
  const nodes = Array.isArray(parsed) ? parsed : []

  const configured = getConfiguredBackendUrl()
  if (isRemoteBackendUrl(configured)) {
    nodes.push({
      url: configured,
      invite: getBackendInvite(),
      active: true,
      updatedAt: Date.now(),
    })
  }

  return uniqueRemoteNodes(nodes)
}

function setRemoteNodes(nodes) {
  if (typeof window === 'undefined') return

  localStorage.setItem(
    REMOTE_NODES_KEY,
    JSON.stringify(uniqueRemoteNodes(nodes))
  )
}

function getActiveRemoteNode() {
  return getRemoteNodes().find(node => node.active) || null
}

function saveRemoteNode(url, invite = getBackendInvite(), active = true) {
  const cleaned = normalizeBackendUrl(url)
  if (!isRemoteBackendUrl(cleaned)) return

  const nodes = getRemoteNodes().map(node => ({
    ...node,
    active: active ? false : node.active,
  }))
  nodes.unshift({
    url: cleaned,
    invite: (invite || '').trim(),
    active,
    updatedAt: Date.now(),
  })
  setRemoteNodes(nodes)
}

function clearActiveRemoteNode() {
  setRemoteNodes(
    getRemoteNodes().map(node => ({
      ...node,
      active: false,
    }))
  )
}

function getLocalNodeHistoryItem(activeBackendUrl = getBackendUrl()) {
  const normalizedActiveUrl = normalizeBackendUrl(activeBackendUrl)
  const fallbackLocalUrl = getDefaultBackendUrl()
  const localUrl = isLocalBackendUrl(normalizedActiveUrl)
    ? normalizedActiveUrl
    : fallbackLocalUrl

  if (!isLocalBackendUrl(localUrl)) return null

  const url = normalizeBackendUrl(localUrl)
  return {
    url,
    invite: '',
    active: url === normalizedActiveUrl,
    local: true,
    updatedAt: Number.MAX_SAFE_INTEGER,
  }
}

function getNodeHistory() {
  if (typeof window === 'undefined') return []

  const activeBackendUrl = normalizeBackendUrl(getBackendUrl())
  const localNode = getLocalNodeHistoryItem(activeBackendUrl)
  const remoteNodes = getRemoteNodes().map((node, index) => ({
    ...node,
    active: normalizeBackendUrl(node.url) === activeBackendUrl,
    local: false,
    order: index + 1,
  }))
  const nodes = localNode
    ? [{ ...localNode, order: 0 }, ...remoteNodes]
    : remoteNodes

  return nodes
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      if (a.local !== b.local) return a.local ? -1 : 1
      return a.order - b.order
    })
    .map(({ order: _order, ...node }) => node)
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

function getCurrentApiIdentity() {
  if (currentApiIdentity?.danger) return currentApiIdentity
  return null
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`
}

function parseJsonText(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function getBackendAuthPath(url) {
  const requestPath = normalizeAuthPath(url)
  const backendUrl = getBackendUrl()
  if (!backendUrl) return requestPath

  try {
    const basePath = new URL(backendUrl).pathname.replace(/\/+$/, '')
    if (!basePath || basePath === '/') return requestPath
    if (requestPath === basePath) return '/'
    if (requestPath.startsWith(`${basePath}/`)) {
      return requestPath.slice(basePath.length)
    }
  } catch {}

  return requestPath
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

          const identity = getCurrentApiIdentity()
          if (identity?.danger) {
            try {
              const authHeaders = await buildAuthHeaders(
                identity,
                request.method,
                getBackendAuthPath(request.url)
              )
              for (const [key, value] of Object.entries(authHeaders)) {
                headers.set(key, value)
              }
            } catch {
              // Keep public/backend probes usable when stored identity data is invalid.
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

  const errorData =
    err && typeof err === 'object' && 'data' in err ? err.data : undefined
  if (errorData !== undefined) {
    return normalizeApiErrorPayload(response, errorData)
  }

  if (!response) return {}

  const data = response.bodyUsed
    ? null
    : await response
        .clone()
        .json()
        .catch(() => null)

  return normalizeApiErrorPayload(response, data)
}

function normalizeApiErrorPayload(response, data) {
  const payload = data && typeof data === 'object' ? data : null
  return {
    status: response?.status,
    code: typeof payload?.code === 'string' ? payload.code : undefined,
    errorCode:
      typeof payload?.errorCode === 'string' ? payload.errorCode : undefined,
    details:
      payload?.details && typeof payload.details === 'object'
        ? payload.details
        : undefined,
    error:
      typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
          ? payload.message
          : typeof data === 'string'
            ? data
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
    if (isRemoteBackendUrl(cleaned)) {
      saveRemoteNode(cleaned)
    }
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
  if (isRemoteBackendUrl(url)) {
    saveRemoteNode(url, invite)
  } else if (typeof window !== 'undefined') {
    clearActiveRemoteNode()
  }
}

export function clearBackendConnection() {
  setBackendUrl('')
  setBackendInvite('')
  if (typeof window !== 'undefined') {
    clearActiveRemoteNode()
  }
}

export function getBackendUrlExport() {
  return getBackendUrl()
}

export function getSameOriginBackendUrlExport() {
  return getSameOriginBackendUrl()
}

export function getRemoteUrlExport() {
  return getActiveRemoteNode()?.url || ''
}

export function getRemoteInviteExport() {
  return getActiveRemoteNode()?.invite || ''
}

export function getRemoteNodesExport() {
  return getRemoteNodes()
}

export function getNodeHistoryExport() {
  return getNodeHistory()
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
        getCurrentApiIdentity(),
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

  const identity = getCurrentApiIdentity()
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
      // Leave WebSocket unauthenticated when current identity data is invalid.
    }
  }

  return url.toString()
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
      // Backend detection should still work when current identity data is invalid.
    }
    const res = await fetch(`${cleanedUrl}/api/remote/capabilities`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return { ok: false, reason: 'http' }
    const data = await res
      .clone()
      .json()
      .catch(() => null)
    if (
      !data ||
      typeof data.remoteAccess !== 'boolean' ||
      typeof data.inviteRequired !== 'boolean' ||
      typeof data.adminAvailable !== 'boolean' ||
      typeof data.listenHost !== 'string'
    ) {
      return { ok: false, reason: 'http' }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'http' }
  }
}

async function probeWebSocket(cleanedUrl, invite, identity) {
  if (typeof WebSocket === 'undefined') return { ok: true }
  if (!identity?.danger) return { ok: true }

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
        // Leave WebSocket unauthenticated when current identity data is invalid.
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

  const identity = getCurrentApiIdentity()

  const [httpResult, wsResult] = await Promise.all([
    probeHttp(cleanedUrl, invite, identity),
    probeWebSocket(cleanedUrl, invite, identity),
  ])

  if (!httpResult.ok) return httpResult
  if (!wsResult.ok) return wsResult
  return { ok: true }
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
