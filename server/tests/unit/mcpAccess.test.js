import { describe, it } from 'node:test'
import assert from 'node:assert'
import { authorizeMcpApiRequest } from '../../src/mcp/access.js'

describe('MCP API scope policy', () => {
  const principal = {
    scopes: ['node:read', 'files:read', 'files:download'],
  }

  it('allows only explicitly mapped methods and paths', () => {
    assert.strictEqual(
      authorizeMcpApiRequest(principal, 'GET', '/api/node/status').allowed,
      true
    )
    assert.strictEqual(
      authorizeMcpApiRequest(principal, 'POST', '/api/download').allowed,
      true
    )
    assert.strictEqual(
      authorizeMcpApiRequest(principal, 'DELETE', '/api/files/cid').allowed,
      false
    )
    assert.strictEqual(
      authorizeMcpApiRequest(principal, 'POST', '/api/shutdown').allowed,
      false
    )
  })

  it('denies a mapped API when its scope is missing', () => {
    const result = authorizeMcpApiRequest(
      principal,
      'POST',
      '/api/mcp/publish-local'
    )
    assert.deepStrictEqual(result, {
      allowed: false,
      reason: 'MCP_SCOPE_FORBIDDEN',
      requiredScope: 'files:publish',
    })
  })
})
