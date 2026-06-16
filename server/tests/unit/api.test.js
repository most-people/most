import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  api,
  checkBackendConnectionTarget,
  clearBackendConnection,
  configureBackend,
  getAuthenticatedWebSocketUrl,
  getWebSocketUrl,
} from '../../src/utils/api.js'
import { verifyAuthHeader } from '../../src/utils/auth.js'

class MemoryStorage {
  #items = new Map()

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null
  }

  setItem(key, value) {
    this.#items.set(key, String(value))
  }

  removeItem(key) {
    this.#items.delete(key)
  }

  clear() {
    this.#items.clear()
  }
}

function installBrowserEnv({
  hostname = 'app.example.com',
  origin = 'https://app.example.com',
} = {}) {
  globalThis.window = {
    location: {
      hostname,
      origin,
    },
  }
  globalThis.localStorage = new MemoryStorage()
}

function installWebSocketProbe({ opens = true, urls = [] } = {}) {
  globalThis.WebSocket = class FakeWebSocket {
    constructor(url) {
      this.url = url
      urls.push(url)
      queueMicrotask(() => {
        if (opens) {
          this.onopen?.()
        } else {
          this.onerror?.(new Error('failed'))
        }
      })
    }

    close() {}
  }
}

function installStoredIdentity() {
  localStorage.setItem(
    'mostbox_identity',
    JSON.stringify({ danger: '0x' + '11'.repeat(32) })
  )
}

function capabilitiesResponse() {
  return new Response(
    JSON.stringify({
      remoteAccess: false,
      inviteRequired: true,
      inviteConfigured: false,
      authenticated: false,
      userAddress: null,
      adminAvailable: true,
      listenHost: '127.0.0.1',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  )
}

describe('api browser helpers', () => {
  const originalWindow = globalThis.window
  const originalLocalStorage = globalThis.localStorage
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    installBrowserEnv()
  })

  afterEach(() => {
    clearBackendConnection()

    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }

    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = originalLocalStorage
    }

    if (originalFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = originalFetch
    }

    if (originalWebSocket === undefined) {
      delete globalThis.WebSocket
    } else {
      globalThis.WebSocket = originalWebSocket
    }
  })

  describe('getWebSocketUrl()', () => {
    it('uses the localhost daemon by default on a local frontend', () => {
      installBrowserEnv({
        hostname: 'localhost',
        origin: 'http://localhost:3000',
      })

      assert.strictEqual(getWebSocketUrl(), 'ws://localhost:1976/ws')
    })

    it('uses the current origin when no backend is configured remotely', () => {
      assert.strictEqual(getWebSocketUrl(), 'wss://app.example.com/ws')
    })

    it('preserves a configured backend base path', () => {
      configureBackend({
        url: 'http://node.example.com:1976/mostbox/',
        invite: '',
      })

      assert.strictEqual(
        getWebSocketUrl('/ws'),
        'ws://node.example.com:1976/mostbox/ws'
      )
      assert.strictEqual(
        getWebSocketUrl('events'),
        'ws://node.example.com:1976/mostbox/events'
      )
    })

    it('uses wss for https backends', () => {
      configureBackend({
        url: 'https://node.example.com/base',
        invite: '',
      })

      assert.strictEqual(
        getWebSocketUrl('/ws'),
        'wss://node.example.com/base/ws'
      )
    })
  })

  describe('getAuthenticatedWebSocketUrl()', () => {
    it('attaches the remote invite to non-local WebSocket URLs', async () => {
      configureBackend({
        url: 'https://node.example.com/base',
        invite: 'invite-code',
      })

      const url = new URL(await getAuthenticatedWebSocketUrl('/ws'))

      assert.strictEqual(
        url.toString(),
        'wss://node.example.com/base/ws?invite=invite-code'
      )
    })

    it('does not attach an invite to local WebSocket URLs', async () => {
      configureBackend({
        url: 'http://127.0.0.1:1976',
        invite: 'invite-code',
      })

      const url = new URL(await getAuthenticatedWebSocketUrl('/ws'))

      assert.strictEqual(url.toString(), 'ws://127.0.0.1:1976/ws')
    })
  })

  describe('api request auth', () => {
    it('signs the rewritten backend path behind a reverse proxy prefix', async () => {
      configureBackend({
        url: 'https://node.example.com/fe-customer-api',
        invite: 'invite-code',
      })
      installStoredIdentity()
      globalThis.fetch = async request => {
        assert.strictEqual(
          request.url,
          'https://node.example.com/fe-customer-api/api/channels'
        )
        assert.strictEqual(
          request.headers.get('x-mostbox-invite'),
          'invite-code'
        )
        assert.strictEqual(
          verifyAuthHeader(
            request.headers.get('authorization'),
            'POST',
            '/api/channels'
          ).ok,
          true
        )
        return new Response('{}', { status: 200 })
      }

      await api.post('/api/channels', { json: { name: 'test' } }).json()
    })
  })

  describe('checkBackendConnectionTarget()', () => {
    it('reports http when the capability probe fails', async () => {
      const wsUrls = []
      globalThis.fetch = async () => new Response('{}', { status: 503 })
      installWebSocketProbe({ urls: wsUrls })
      installStoredIdentity()

      const result = await checkBackendConnectionTarget({
        url: 'https://node.example.com/base',
        invite: 'invite-code',
      })

      assert.deepStrictEqual(result, { ok: false, reason: 'http' })
      assert.strictEqual(wsUrls.length, 1)
      assert.strictEqual(new URL(wsUrls[0]).pathname, '/base/ws')
      assert.strictEqual(
        new URL(wsUrls[0]).searchParams.get('invite'),
        'invite-code'
      )
    })

    it('reports ws when HTTP works but the WebSocket probe fails', async () => {
      const wsUrls = []
      globalThis.fetch = async input => {
        assert.strictEqual(
          String(input),
          'https://node.example.com/base/api/remote/capabilities'
        )
        return capabilitiesResponse()
      }
      installWebSocketProbe({ opens: false, urls: wsUrls })
      installStoredIdentity()

      const result = await checkBackendConnectionTarget({
        url: 'https://node.example.com/base',
        invite: 'invite-code',
      })

      assert.deepStrictEqual(result, { ok: false, reason: 'ws' })
      assert.strictEqual(wsUrls.length, 1)
      assert.strictEqual(new URL(wsUrls[0]).pathname, '/base/ws')
      assert.strictEqual(
        new URL(wsUrls[0]).searchParams.get('invite'),
        'invite-code'
      )
    })

    it('returns ok only when HTTP and WebSocket both work', async () => {
      globalThis.fetch = async () => capabilitiesResponse()
      installWebSocketProbe()
      installStoredIdentity()

      const result = await checkBackendConnectionTarget({
        url: 'https://node.example.com/base',
      })

      assert.deepStrictEqual(result, { ok: true })
    })

    it('skips the signed WebSocket probe before login', async () => {
      const wsUrls = []
      globalThis.fetch = async () => capabilitiesResponse()
      installWebSocketProbe({ urls: wsUrls })

      const result = await checkBackendConnectionTarget({
        url: 'https://node.example.com/base',
        invite: 'invite-code',
      })

      assert.deepStrictEqual(result, { ok: true })
      assert.deepStrictEqual(wsUrls, [])
    })

    it('does not require WebSocket in a non-browser runtime', async () => {
      delete globalThis.WebSocket
      globalThis.fetch = async () => capabilitiesResponse()

      const result = await checkBackendConnectionTarget({
        url: 'https://node.example.com/base',
      })

      assert.deepStrictEqual(result, { ok: true })
    })

    it('rejects non-MostBox HTTP responses', async () => {
      globalThis.fetch = async () =>
        new Response('<html>not the daemon</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })

      const result = await checkBackendConnectionTarget({
        url: 'https://node.example.com/base',
      })

      assert.deepStrictEqual(result, { ok: false, reason: 'http' })
    })
  })

})
