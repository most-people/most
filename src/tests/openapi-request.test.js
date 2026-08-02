import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { build } from 'esbuild'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRootPath = fileURLToPath(new URL('../../', import.meta.url))

async function importRequestHelper() {
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL('../features/docs/openapiRequest.js', import.meta.url)
      ),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'repo-alias',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^~server\// }, args => ({
            path: path.join(repoRootPath, 'server', args.path.slice(8)),
          }))
        },
      },
    ],
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
}

describe('OpenAPI interactive request adapter', () => {
  it('adds generated MostBox authentication headers', async () => {
    const { createOpenApiFetch } = await importRequestHelper()
    let sentRequest
    const customFetch = createOpenApiFetch({
      spec: {
        paths: {
          '/api/files': {
            get: { operationId: 'listFiles', 'x-mostbox-confirmation': false },
          },
        },
      },
      confirmRequest: async () => true,
      getRequestHeaders: async () => ({
        Authorization: 'signed-header',
        'x-mostbox-invite': 'invite-code',
      }),
      fetchImpl: async request => {
        sentRequest = request
        return new Response('{}')
      },
    })

    await customFetch('http://localhost:1976/api/files')

    assert.equal(sentRequest.headers.get('authorization'), 'signed-header')
    assert.equal(sentRequest.headers.get('x-mostbox-invite'), 'invite-code')
  })

  it('preserves an explicit MCP bearer token', async () => {
    const { createOpenApiFetch } = await importRequestHelper()
    let sentRequest
    const customFetch = createOpenApiFetch({
      spec: { paths: {} },
      confirmRequest: async () => true,
      getRequestHeaders: async () => ({ Authorization: 'signed-header' }),
      fetchImpl: async request => {
        sentRequest = request
        return new Response('{}')
      },
    })

    await customFetch('http://localhost:1976/api/mcp/me', {
      headers: { Authorization: 'Bearer mcp-token' },
    })

    assert.equal(sentRequest.headers.get('authorization'), 'Bearer mcp-token')
  })

  it('does not send a sensitive request when confirmation is cancelled', async () => {
    const { createOpenApiFetch } = await importRequestHelper()
    let fetchCount = 0
    const confirmations = []
    const customFetch = createOpenApiFetch({
      spec: {
        paths: {
          '/api/node/logs': {
            delete: {
              operationId: 'clearNodeLogs',
              summary: 'Clear logs',
              'x-mostbox-confirmation': true,
            },
          },
        },
      },
      confirmRequest: async request => {
        confirmations.push(request)
        return false
      },
      getRequestHeaders: async () => ({}),
      fetchImpl: async () => {
        fetchCount += 1
        return new Response('{}')
      },
    })

    await assert.rejects(
      customFetch('http://localhost:1976/api/node/logs', {
        method: 'DELETE',
      }),
      error => error.name === 'AbortError'
    )
    assert.equal(fetchCount, 0)
    assert.deepEqual(confirmations, [
      {
        method: 'DELETE',
        path: '/api/node/logs',
        operationId: 'clearNodeLogs',
        summary: 'Clear logs',
      },
    ])
  })
})
