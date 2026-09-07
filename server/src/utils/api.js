import ky from 'ky'
import { buildAuthHeaders, normalizeAuthPath } from './auth.js'

const STORAGE_KEY = 'mostbox_backend_url'
const INVITE_STORAGE_KEY = 'mostbox_backend_invite'
const REMOTE_NODES_KEY = 'mostbox_remote_nodes'
const LOCALHOST_BACKEND_URL = 'http://localhost:1976'
const MAX_REMOTE_NODES = 8

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
  const input = String(url || '')
    .trim()
    .replace(/\/+$/, '')
  if (!input) return ''

  try {
    const parsed = new URL(input)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function hasExplicitUrlProtocol(value) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(String(value || '').trim())
}

export function getBackendConnectionCandidates(value) {
  const input = String(value || '')
    .trim()
    .replace(/\/+$/, '')
  if (!input) return []

  const candidates = hasExplicitUrlProtocol(input)
    ? [input]
    : [`https://${input}`, `http://${input}`]

  return [...new Set(candidates.map(normalizeBackendUrl).filter(Boolean))]
}

function isLocalBackendUrl(url) {
  const value = String(url || '').trim()
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

          const identity = getStoredIdentity()
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

/**
 * @typedef {{ ok: false, reason: 'http' | 'ws', retryable: boolean, status?: number }} BackendConnectionFailure
 * @typedef {{ ok: true } | BackendConnectionFailure} BackendProbeResult
 */

/**
 * @param {'http' | 'ws'} reason
 * @param {boolean} retryable
 * @param {number} [status]
 * @returns {BackendConnectionFailure}
 */
function backendProbeFailure(reason, retryable, status) {
  return {
    ok: false,
    reason,
    retryable,
    ...(status === undefined ? {} : { status }),
  }
}

function isRetryableBackendStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(status)
}

/** @returns {Promise<BackendProbeResult>} */
async function probeHttp(cleanedUrl, invite, identity, signal) {
  let status
  try {
    signal?.throwIfAborted()
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
    signal?.throwIfAborted()
    const timeoutSignal = AbortSignal.timeout(3000)
    const res = await fetch(`${cleanedUrl}/api/remote/capabilities`, {
      method: 'GET',
      headers,
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    })
    signal?.throwIfAborted()
    status = res.status
    if (!res.ok) {
      return backendProbeFailure(
        'http',
        isRetryableBackendStatus(status),
        status
      )
    }
    const data = await res.json()
    signal?.throwIfAborted()
    if (!isMostBoxCapabilities(data)) {
      return backendProbeFailure('http', false, status)
    }
    return { ok: true }
  } catch (error) {
    signal?.throwIfAborted()
    return backendProbeFailure('http', !(error instanceof SyntaxError), status)
  }
}

function isMostBoxCapabilities(data) {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.remoteAccess === 'boolean' &&
    typeof data.inviteRequired === 'boolean' &&
    typeof data.adminAvailable === 'boolean' &&
    typeof data.listenHost === 'string'
  )
}

/** @returns {Promise<BackendProbeResult>} */
async function probeMostBoxEndpoint(cleanedUrl, signal) {
  let status
  try {
    signal?.throwIfAborted()
    const timeoutSignal = AbortSignal.timeout(3000)
    const res = await fetch(`${cleanedUrl}/api/remote/capabilities`, {
      method: 'GET',
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    })
    signal?.throwIfAborted()
    status = res.status
    let data
    try {
      data = await res.json()
    } catch (error) {
      signal?.throwIfAborted()
      return backendProbeFailure(
        'http',
        res.ok
          ? !(error instanceof SyntaxError)
          : isRetryableBackendStatus(status),
        status
      )
    }
    signal?.throwIfAborted()
    if (
      isMostBoxCapabilities(data) ||
      (res.status === 403 && data?.code === 'INVALID_INVITE')
    ) {
      return { ok: true }
    }
    return backendProbeFailure('http', isRetryableBackendStatus(status), status)
  } catch (error) {
    signal?.throwIfAborted()
    return backendProbeFailure('http', !(error instanceof SyntaxError), status)
  }
}

/** @returns {Promise<BackendProbeResult>} */
async function probeWebSocket(cleanedUrl, invite, identity, signal) {
  signal?.throwIfAborted()
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
        // Leave WebSocket unauthenticated when local identity data is invalid.
      }
    }

    signal?.throwIfAborted()
    return await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl.toString())
      let settled = false
      let timeout
      const cleanup = () => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
        ws.onopen = null
        ws.onerror = null
        ws.onclose = null
        try {
          ws.close()
        } catch {
          // Some browsers reject closing a socket during its handshake.
        }
      }
      const finish = result => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }
      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(signal.reason)
      }
      timeout = setTimeout(() => finish(backendProbeFailure('ws', true)), 4000)
      ws.onopen = () => finish({ ok: true })
      ws.onerror = () => finish(backendProbeFailure('ws', true))
      ws.onclose = () => finish(backendProbeFailure('ws', true))
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  } catch {
    signal?.throwIfAborted()
    return backendProbeFailure('ws', true)
  }
}

/**
 * @param {{ url: string, invite?: string, signal?: AbortSignal }} options
 * @returns {Promise<{ ok: true, url: string, reason?: never, retryable?: never, status?: never } | BackendConnectionFailure>}
 */
export async function checkBackendConnectionTarget({
  url,
  invite = '',
  signal,
}) {
  signal?.throwIfAborted()
  const candidates = getBackendConnectionCandidates(url)
  if (candidates.length === 0) return backendProbeFailure('http', false)

  let cleanedUrl = candidates[0]
  if (!hasExplicitUrlProtocol(url)) {
    cleanedUrl = ''
    let failure = backendProbeFailure('http', false)
    for (const candidate of candidates) {
      const result = await probeMostBoxEndpoint(candidate, signal)
      if (result.ok) {
        cleanedUrl = candidate
        break
      }
      if (!failure.retryable || result.retryable) failure = result
    }
    if (!cleanedUrl) return failure
  }

  const identity = getStoredIdentity()

  const [httpResult, wsResult] = await Promise.all([
    probeHttp(cleanedUrl, invite, identity, signal),
    probeWebSocket(cleanedUrl, invite, identity, signal),
  ])

  signal?.throwIfAborted()
  if (!httpResult.ok) return httpResult
  if (!wsResult.ok) return wsResult
  return { ok: true, url: cleanedUrl }
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
