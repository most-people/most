const DEFAULT_MAX_ENTRIES = 10_000

const DEFAULT_POLICIES = {
  global: { windowMs: 60 * 1000, maxRequests: 600 },
  expensiveWrite: { windowMs: 60 * 1000, maxRequests: 30 },
  adminWrite: { windowMs: 60 * 1000, maxRequests: 60 },
  adminClaim: { windowMs: 10 * 60 * 1000, maxRequests: 10 },
  authFailure: { windowMs: 5 * 60 * 1000, maxRequests: 20 },
  inviteFailure: { windowMs: 5 * 60 * 1000, maxRequests: 20 },
}

const EXPENSIVE_WRITE_PATHS = new Set([
  '/api/publish',
  '/api/folder/share',
  '/api/download',
  '/api/p2p/pull',
  '/api/user/import',
  '/api/note-vault/restore',
])

const ADMIN_WRITE_PATHS = new Set([
  '/api/config',
  '/api/display-name',
  '/api/node/config',
  '/api/node/holdings',
  '/api/node/policy',
  '/api/node/logs',
  '/api/shutdown',
])

function normalizeClientAddress(value) {
  const address = String(value || '')
    .trim()
    .toLowerCase()
  return address.startsWith('::ffff:') ? address.slice(7) : address || 'unknown'
}

export function getRateLimitClientKey(c) {
  return normalizeClientAddress(c.env?.incoming?.socket?.remoteAddress)
}

export function getRequestRateLimitPolicies(methodInput, path) {
  const method = String(methodInput || 'GET').toUpperCase()
  if (method === 'OPTIONS') return []

  const policies = ['global']
  if (method === 'POST' && path === '/api/admin/access') {
    policies.push('adminClaim')
  } else if (method !== 'GET' && method !== 'HEAD') {
    if (
      EXPENSIVE_WRITE_PATHS.has(path) ||
      /^\/api\/files\/[^/]+\/cache$/.test(path)
    ) {
      policies.push('expensiveWrite')
    }
    if (ADMIN_WRITE_PATHS.has(path) || path.startsWith('/api/admin/')) {
      policies.push('adminWrite')
    }
  }
  return policies
}

export function createRateLimitGuard(options = {}) {
  const now = options.now || Date.now
  const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES
  const policies = { ...DEFAULT_POLICIES, ...(options.policies || {}) }
  const counters = new Map()
  let consumeCount = 0

  function cleanupExpired(timestamp) {
    for (const [key, entry] of counters) {
      if (entry.resetAt <= timestamp) counters.delete(key)
    }
  }

  function makeRoom(timestamp) {
    cleanupExpired(timestamp)
    while (counters.size >= maxEntries) {
      const oldestKey = counters.keys().next().value
      if (oldestKey === undefined) break
      counters.delete(oldestKey)
    }
  }

  function consume(c, policyName) {
    const policy = policies[policyName]
    if (!policy) throw new Error(`Unknown rate limit policy: ${policyName}`)

    const timestamp = now()
    const clientKey = getRateLimitClientKey(c)
    const counterKey = `${policyName}:${clientKey}`
    let entry = counters.get(counterKey)

    consumeCount += 1
    if (consumeCount % 256 === 0) cleanupExpired(timestamp)

    if (!entry || entry.resetAt <= timestamp) {
      if (!entry && counters.size >= maxEntries) makeRoom(timestamp)
      entry = { count: 0, resetAt: timestamp + policy.windowMs }
      counters.set(counterKey, entry)
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - timestamp) / 1000)
    )
    if (entry.count >= policy.maxRequests) {
      return {
        allowed: false,
        limit: policy.maxRequests,
        remaining: 0,
        retryAfterSeconds,
      }
    }

    entry.count += 1
    return {
      allowed: true,
      limit: policy.maxRequests,
      remaining: Math.max(0, policy.maxRequests - entry.count),
      retryAfterSeconds,
    }
  }

  function inspect(c, policyName) {
    const policy = policies[policyName]
    if (!policy) throw new Error(`Unknown rate limit policy: ${policyName}`)

    const timestamp = now()
    const counterKey = `${policyName}:${getRateLimitClientKey(c)}`
    const entry = counters.get(counterKey)
    if (!entry || entry.resetAt <= timestamp) {
      if (entry) counters.delete(counterKey)
      return { allowed: true }
    }

    return {
      allowed: entry.count < policy.maxRequests,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((entry.resetAt - timestamp) / 1000)
      ),
    }
  }

  function blockedResponse(c, policyName, retryAfterSeconds) {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(
      {
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        policy: policyName,
        retryAfterSeconds,
      },
      429
    )
  }

  function enforce(c, policyNames) {
    for (const policyName of policyNames) {
      const result = consume(c, policyName)
      if (!result.allowed) {
        return blockedResponse(c, policyName, result.retryAfterSeconds)
      }
    }
    return null
  }

  function rejectIfBlocked(c, policyNames) {
    for (const policyName of policyNames) {
      const result = inspect(c, policyName)
      if (!result.allowed) {
        return blockedResponse(c, policyName, result.retryAfterSeconds)
      }
    }
    return null
  }

  function middleware() {
    return async (c, next) => {
      const path = new URL(c.req.url).pathname
      const response = enforce(
        c,
        getRequestRateLimitPolicies(c.req.method, path)
      )
      if (response) return response
      await next()
    }
  }

  return {
    consume,
    enforce,
    inspect,
    middleware,
    rejectIfBlocked,
    getEntryCount: () => counters.size,
  }
}
