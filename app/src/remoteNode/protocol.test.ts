import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAuthenticatedWebSocketUrl,
  buildRemoteApiUrl,
  buildRemoteHeaders,
  getRemoteAuthPath,
  resolveRemoteUrl,
} from './protocol'
import { createMobileIdentity } from './identity'

function capabilitiesResponse() {
  return new Response(
    JSON.stringify({
      remoteAccess: true,
      inviteRequired: true,
      adminAvailable: false,
      listenHost: '0.0.0.0',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  )
}

describe('remote node protocol', () => {
  it('keeps reverse proxy prefixes in transport URLs but not auth paths', () => {
    const url = buildRemoteApiUrl(
      'https://node.example.com/customer/',
      '/api/files'
    )
    assert.equal(url, 'https://node.example.com/customer/api/files')
    assert.equal(
      getRemoteAuthPath('https://node.example.com/customer', url),
      '/api/files'
    )
  })

  it('attaches invite and signed WebSocket credentials', async () => {
    const identity = createMobileIdentity('alice', 'password')
    const headers = await buildRemoteHeaders({
      baseUrl: 'https://node.example.com/base',
      invite: 'invite-code',
      identity,
      method: 'GET',
      path: '/api/files',
    })
    assert.equal(headers['x-mostbox-invite'], 'invite-code')
    assert.match(headers.Authorization, new RegExp(`^${identity.address},`))

    const ws = new URL(
      await buildAuthenticatedWebSocketUrl({
        baseUrl: 'https://node.example.com/base',
        invite: 'invite-code',
        identity,
      })
    )
    assert.equal(ws.protocol, 'wss:')
    assert.equal(ws.pathname, '/base/ws')
    assert.equal(ws.searchParams.get('invite'), 'invite-code')
    assert.equal(ws.searchParams.get('address'), identity.address)
  })

  it('resolves a bare address to HTTPS without sending credentials', async () => {
    const requests: Array<{ url: string; headers: Headers }> = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
      })
      return capabilitiesResponse()
    }) as typeof fetch

    const url = await resolveRemoteUrl('node.example.com/base/', { fetchImpl })

    assert.equal(url, 'https://node.example.com/base')
    assert.equal(requests.length, 1)
    assert.equal(
      requests[0].url,
      'https://node.example.com/base/api/remote/capabilities'
    )
    assert.equal(requests[0].headers.get('x-mostbox-invite'), null)
    assert.equal(requests[0].headers.get('authorization'), null)
  })

  it('falls back to HTTP when HTTPS does not identify a MostBox node', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.startsWith('https://')) throw new TypeError('TLS unavailable')
      return capabilitiesResponse()
    }) as typeof fetch

    const url = await resolveRemoteUrl('node.example.com:1976/base', {
      fetchImpl,
    })

    assert.equal(url, 'http://node.example.com:1976/base')
    assert.deepEqual(urls, [
      'https://node.example.com:1976/base/api/remote/capabilities',
      'http://node.example.com:1976/base/api/remote/capabilities',
    ])
  })

  it('does not downgrade after HTTPS identifies a protected MostBox node', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ code: 'INVALID_INVITE' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const url = await resolveRemoteUrl('node.example.com', { fetchImpl })

    assert.equal(url, 'https://node.example.com')
    assert.deepEqual(urls, ['https://node.example.com/api/remote/capabilities'])
  })

  it('does not probe another protocol when one is explicit', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return capabilitiesResponse()
    }) as typeof fetch

    const url = await resolveRemoteUrl('http://node.example.com/base/', {
      fetchImpl,
    })

    assert.equal(url, 'http://node.example.com/base')
    assert.equal(calls, 0)
  })
})
