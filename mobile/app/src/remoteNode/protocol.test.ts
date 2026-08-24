import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAuthenticatedWebSocketUrl,
  buildRemoteApiUrl,
  buildRemoteHeaders,
  getRemoteAuthPath,
} from './protocol'
import { createMobileIdentity } from './identity'

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
})
