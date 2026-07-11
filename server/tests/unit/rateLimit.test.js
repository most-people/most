import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import {
  createRateLimitGuard,
  getRequestRateLimitPolicies,
} from '../../src/http/rateLimit.js'

function requestContext(remoteAddress) {
  return { incoming: { socket: { remoteAddress } } }
}

function createGuardedApp(guard) {
  const app = new Hono()
  app.use('/api/*', guard.middleware())
  app.all('/api/*', c => c.json({ success: true }))
  return app
}

describe('HTTP rate limit guard', () => {
  it('accumulates requests and resets after the fixed window', async () => {
    let timestamp = 1_000
    const guard = createRateLimitGuard({
      now: () => timestamp,
      policies: { global: { windowMs: 1_000, maxRequests: 2 } },
    })
    const app = createGuardedApp(guard)
    const context = requestContext('::ffff:192.168.1.20')

    assert.strictEqual(
      (await app.request('/api/test', {}, context)).status,
      200
    )
    assert.strictEqual(
      (await app.request('/api/test', {}, context)).status,
      200
    )

    const blocked = await app.request('/api/test', {}, context)
    const blockedData = await blocked.json()
    assert.strictEqual(blocked.status, 429)
    assert.strictEqual(blocked.headers.get('retry-after'), '1')
    assert.strictEqual(blockedData.code, 'RATE_LIMITED')
    assert.strictEqual(blockedData.policy, 'global')

    timestamp += 1_001
    assert.strictEqual(
      (await app.request('/api/test', {}, context)).status,
      200
    )
  })

  it('uses the socket address instead of spoofable forwarding headers', async () => {
    const guard = createRateLimitGuard({
      policies: { global: { windowMs: 60_000, maxRequests: 1 } },
    })
    const app = createGuardedApp(guard)
    const context = requestContext('203.0.113.20')

    const first = await app.request(
      '/api/test',
      { headers: { 'x-forwarded-for': '198.51.100.1' } },
      context
    )
    const second = await app.request(
      '/api/test',
      { headers: { 'x-forwarded-for': '198.51.100.2' } },
      context
    )

    assert.strictEqual(first.status, 200)
    assert.strictEqual(second.status, 429)
  })

  it('applies a separate low-volume bucket to admin claims', async () => {
    const guard = createRateLimitGuard({
      policies: {
        global: { windowMs: 60_000, maxRequests: 10 },
        adminClaim: { windowMs: 60_000, maxRequests: 1 },
      },
    })
    const app = createGuardedApp(guard)
    const context = requestContext('192.168.1.30')

    assert.strictEqual(
      (await app.request('/api/admin/access', {}, context)).status,
      200
    )
    assert.strictEqual(
      (await app.request('/api/admin/access', { method: 'POST' }, context))
        .status,
      200
    )

    const blocked = await app.request(
      '/api/admin/access',
      { method: 'POST' },
      context
    )
    const blockedData = await blocked.json()
    assert.strictEqual(blocked.status, 429)
    assert.strictEqual(blockedData.policy, 'adminClaim')
  })

  it('bounds the number of retained client counters', () => {
    const guard = createRateLimitGuard({
      maxEntries: 2,
      policies: { global: { windowMs: 60_000, maxRequests: 10 } },
    })

    for (const address of ['192.168.1.1', '192.168.1.2', '192.168.1.3']) {
      guard.consume({ env: requestContext(address) }, 'global')
    }

    assert.strictEqual(guard.getEntryCount(), 2)
  })

  it('rejects an exhausted failure bucket without consuming another entry', () => {
    const guard = createRateLimitGuard({
      policies: { authFailure: { windowMs: 60_000, maxRequests: 1 } },
    })
    const c = { env: requestContext('192.168.1.40') }

    assert.strictEqual(guard.consume(c, 'authFailure').allowed, true)
    assert.strictEqual(guard.inspect(c, 'authFailure').allowed, false)
  })
})

describe('request rate limit policies', () => {
  it('classifies expensive and administrative writes without throttling preflight', () => {
    assert.deepStrictEqual(
      getRequestRateLimitPolicies('OPTIONS', '/api/publish'),
      []
    )
    assert.deepStrictEqual(
      getRequestRateLimitPolicies('POST', '/api/publish'),
      ['global', 'expensiveWrite']
    )
    assert.deepStrictEqual(
      getRequestRateLimitPolicies('POST', '/api/node/config'),
      ['global', 'adminWrite']
    )
    assert.deepStrictEqual(
      getRequestRateLimitPolicies('DELETE', '/api/admin/users/0x1/data'),
      ['global', 'adminWrite']
    )
  })
})
