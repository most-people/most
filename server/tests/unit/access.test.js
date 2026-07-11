import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getAllowedOrigins,
  isAllowedRequestOrigin,
  isLocalRequest,
  isLocalUpgradeRequest,
  isRemoteAccessRequest,
} from '../../src/http/access.js'

function createContext({ host = 'localhost:1976', remoteAddress = '' } = {}) {
  return {
    req: {
      header(name) {
        return name === 'host' ? host : undefined
      },
    },
    env: { incoming: { socket: { remoteAddress } } },
  }
}

describe('HTTP access boundary', () => {
  it('requires both a loopback socket and a loopback Host header', () => {
    assert.strictEqual(
      isLocalRequest(createContext({ remoteAddress: '::ffff:127.0.0.1' })),
      true
    )
    assert.strictEqual(
      isLocalRequest(createContext({ remoteAddress: '203.0.113.20' })),
      false
    )
    assert.strictEqual(
      isLocalRequest(
        createContext({
          host: 'mostbox.example.com',
          remoteAddress: '127.0.0.1',
        })
      ),
      false
    )
  })

  it('only trusts private-network sockets when explicitly enabled', () => {
    const context = createContext({
      host: '192.168.31.171:1976',
      remoteAddress: '::ffff:192.168.31.239',
    })
    assert.strictEqual(isLocalRequest(context), false)
    assert.strictEqual(
      isLocalRequest(context, { trustPrivateNetwork: true }),
      true
    )
  })

  it('treats an untrusted browser origin as remote on loopback', () => {
    const allowedOrigins = getAllowedOrigins(1976)
    assert.strictEqual(
      isRemoteAccessRequest({
        origin: 'https://attacker.example',
        local: true,
        allowedOrigins,
      }),
      true
    )
    assert.strictEqual(
      isRemoteAccessRequest({
        origin: 'https://most.box',
        local: true,
        allowedOrigins,
      }),
      false
    )
  })

  it('allows a browser origin that exactly matches the trusted request Host', () => {
    const allowedOrigins = getAllowedOrigins(1976)
    assert.strictEqual(
      isAllowedRequestOrigin(
        'http://192.168.31.171:1976',
        allowedOrigins,
        '192.168.31.171:1976'
      ),
      true
    )
    assert.strictEqual(
      isAllowedRequestOrigin(
        'http://192.168.31.50:1976',
        allowedOrigins,
        '192.168.31.171:1976'
      ),
      false
    )
  })
})

describe('WebSocket access boundary', () => {
  it('does not trust a loopback Host header from a remote socket', () => {
    assert.strictEqual(
      isLocalUpgradeRequest({
        headers: { host: 'localhost:1976' },
        socket: { remoteAddress: '203.0.113.20' },
      }),
      false
    )
  })
})
