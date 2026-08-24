import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  createOpenApiSpec,
  findOpenApiOperation,
  listOpenApiOperations,
} from '../../src/http/openapi.js'
import {
  buildOpenApiSpec,
  getPackageVersion,
} from '../../src/http/nodeStatus.js'

describe('MostBox OpenAPI contract', () => {
  const spec = createOpenApiSpec({
    serverUrl: 'http://localhost:1976/',
    version: 'test-version',
  })
  const operations = listOpenApiOperations(spec)

  it('describes the 47 stable operations with unique ids and known tags', () => {
    assert.equal(spec.openapi, '3.1.0')
    assert.equal(spec.info.version, 'test-version')
    assert.deepEqual(spec.servers, [{ url: 'http://localhost:1976' }])
    assert.equal(operations.length, 47)

    const operationIds = operations.map(item => item.operation.operationId)
    assert.equal(new Set(operationIds).size, operationIds.length)

    const tags = new Set(spec.tags.map(tag => tag.name))
    for (const { operation } of operations) {
      assert.equal(typeof operation.operationId, 'string')
      assert.equal(operation.tags.length, 1)
      assert.ok(tags.has(operation.tags[0]))
      assert.match(
        operation['x-mostbox-side-effect'],
        /^(none|write|dangerous)$/
      )
      assert.ok(Array.isArray(operation.security))
      assert.ok(
        Object.entries(operation.responses).some(
          ([status, response]) => /^2\d\d$/.test(status) && response.content
        )
      )
    }
  })

  it('declares every path placeholder as a required path parameter', () => {
    for (const { path, operation } of operations) {
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map(
        match => match[1]
      )
      const declared = (operation.parameters || [])
        .filter(parameter => parameter.in === 'path' && parameter.required)
        .map(parameter => parameter.name)
      assert.deepEqual(
        declared.sort(),
        placeholders.sort(),
        operation.operationId
      )
    }
  })

  it('documents request bodies for all body-bearing stable routes', () => {
    const expected = new Set([
      'createMcpClient',
      'publishMcpLocalFile',
      'updateNodeConfig',
      'updateNodePolicy',
      'evaluateNodePolicy',
      'createNodeHolding',
      'pullFileByCid',
      'startP2PPing',
      'updateUserProfile',
      'importUserData',
      'cacheFileByCid',
      'publishFile',
      'shareFolder',
      'checkDownloadAvailability',
      'startDownload',
      'cancelDownload',
      'createChannel',
      'leaveChannel',
      'sendChannelMessage',
      'updateChannelMemberProfile',
      'updateChannelRemark',
      'updateChannelPin',
    ])

    assert.deepEqual(
      new Set(
        operations
          .filter(item => item.operation.requestBody)
          .map(item => item.operation.operationId)
      ),
      expected
    )

    for (const { operation } of operations.filter(
      item => item.operation.requestBody
    )) {
      for (const mediaType of Object.values(operation.requestBody.content)) {
        assert.ok(mediaType.schema, operation.operationId)
        assert.notEqual(mediaType.example, undefined, operation.operationId)
      }
    }
  })

  it('includes schemas and examples for every JSON response', () => {
    for (const { operation } of operations) {
      for (const response of Object.values(operation.responses)) {
        const json = response.content?.['application/json']
        if (!json) continue
        assert.ok(json.schema, operation.operationId)
        assert.notEqual(json.example, undefined, operation.operationId)
      }
    }
  })

  it('marks sensitive writes for explicit confirmation', () => {
    const confirmations = operations
      .filter(item => item.operation['x-mostbox-confirmation'] === true)
      .map(item => item.operation.operationId)
      .sort()

    assert.deepEqual(confirmations, [
      'claimAdministrationAccess',
      'clearNodeLogs',
      'importUserData',
      'leaveChannel',
      'removeMcpClient',
      'updateNodeConfig',
    ])
    assert.ok(
      operations
        .filter(item => item.operation['x-mostbox-side-effect'] !== 'none')
        .every(item => item.operation.description.includes('Side effect:'))
    )
  })

  it('keeps user, MCP, and public file security distinct', () => {
    assert.deepEqual(spec.paths['/api/files'].get.security, [
      { MostBoxSignature: [] },
    ])
    assert.deepEqual(spec.paths['/api/mcp/me'].get.security, [
      { McpBearer: [] },
    ])
    assert.deepEqual(spec.paths['/api/files/{cid}/download'].get.security, [])
  })

  it('documents the enforced MCP client expiration limit', () => {
    assert.equal(
      spec.components.schemas.McpClientCreateRequest.properties.expiresInDays
        .maximum,
      365
    )
  })

  it('documents file seeding fields used by remote clients', () => {
    const publishedFile = spec.components.schemas.PublishedFile.properties
    assert.deepEqual(publishedFile.source.enum, ['published', 'downloaded'])
    assert.equal(publishedFile.joined.type, 'boolean')
    assert.equal(publishedFile.peerCount.type, 'integer')
  })

  it('matches concrete request paths back to their operation metadata', () => {
    assert.equal(
      findOpenApiOperation(
        spec,
        'DELETE',
        '/api/admin/mcp/clients/client-id?purge=true'
      ).operation.operationId,
      'removeMcpClient'
    )
    assert.equal(
      findOpenApiOperation(spec, 'GET', '/api/channels/general/messages')
        .operation.operationId,
      'listChannelMessages'
    )
    assert.equal(findOpenApiOperation(spec, 'GET', '/api/internal'), undefined)
  })

  it('serves the shared contract with the package version and daemon port', () => {
    const daemonSpec = buildOpenApiSpec(4242)
    assert.equal(daemonSpec.info.version, getPackageVersion())
    assert.deepEqual(daemonSpec.servers, [{ url: 'http://localhost:4242' }])
    assert.equal(listOpenApiOperations(daemonSpec).length, 47)
  })
})
