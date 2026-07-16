import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAuthHeaders, verifyAuthHeader } from '../../src/utils/auth.js'
import { createLoginIdentity } from '../../src/utils/userIdentity.js'

const IDENTITY = createLoginIdentity('auth-user', 'auth-password')

describe('request authorization', () => {
  it('uses the v0.4.2 address, timestamp, and signature contract', async () => {
    const headers = await buildAuthHeaders(IDENTITY, 'GET', '/api/files')
    const parts = headers.Authorization.split(',')

    assert.equal(parts.length, 3)
    assert.equal(parts[0], IDENTITY.address)
    assert.match(parts[1], /^\d+$/)
    assert.match(parts[2], /^0x[a-fA-F0-9]+$/)
    assert.equal(
      verifyAuthHeader(headers.Authorization, 'GET', '/api/files').ok,
      true
    )
  })

  it('does not require or consume a nonce', async () => {
    const headers = await buildAuthHeaders(IDENTITY, 'GET', '/api/files')

    assert.equal(
      verifyAuthHeader(headers.Authorization, 'GET', '/api/files').ok,
      true
    )
    assert.equal(
      verifyAuthHeader(headers.Authorization, 'GET', '/api/files').ok,
      true
    )
  })
})
