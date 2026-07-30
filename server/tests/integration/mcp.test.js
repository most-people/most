import { after, before, describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/client/stdio'
import { createApp } from '../../src/http/app.js'
import { MostBoxEngine } from '../../src/index.js'
import { createNodeConfigStore } from '../../src/node/config.js'
import { createNodeLogger } from '../../src/node/logs.js'
import { buildAuthHeaders } from '../../src/utils/auth.js'
import { createLoginIdentity } from '../../src/utils/userIdentity.js'

const TEST_PORT = 19772
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`
const TEST_IDENTITY = createLoginIdentity('mcp-user', 'mcp-password')
const LOCAL_CONTEXT = {
  incoming: { socket: { remoteAddress: '127.0.0.1' } },
}

async function fetchAs(identity, requestPath, init = {}) {
  const headers = new Headers(init.headers || {})
  const auth = await buildAuthHeaders(
    identity,
    init.method || 'GET',
    requestPath
  )
  for (const [key, value] of Object.entries(auth)) headers.set(key, value)
  return fetch(`${BASE_URL}${requestPath}`, { ...init, headers })
}

function createHttpClient(token, name = 'mostbox-mcp-http-test') {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${BASE_URL}/mcp`),
    { authProvider: { token: async () => token } }
  )
  const client = new Client(
    { name, version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  )
  return { client, transport }
}

describe('MostBox MCP integration', { timeout: 180_000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-mcp-api-'))
  const publishRoot = path.join(tmpDir, 'publish')
  const outsideRoot = path.join(tmpDir, 'outside')
  let engine
  let serverInstance
  let appRuntime
  let fullToken

  async function createCredential(input = {}) {
    const response = await fetchAs(TEST_IDENTITY, '/api/admin/mcp/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name || 'MCP integration client',
        scopes: input.scopes || [
          'node:read',
          'files:read',
          'files:publish',
          'files:download',
          'downloads:cancel',
        ],
        allowedRoots: input.allowedRoots || [publishRoot],
      }),
    })
    assert.strictEqual(response.status, 201)
    return response.json()
  }

  before(async () => {
    fs.mkdirSync(publishRoot)
    fs.mkdirSync(outsideRoot)
    engine = new MostBoxEngine({ dataPath: path.join(tmpDir, 'data') })
    await engine.start()
    const configStore = createNodeConfigStore(path.join(tmpDir, 'config'))
    appRuntime = createApp(engine, {
      port: TEST_PORT,
      host: '127.0.0.1',
      configStore,
      nodeLogger: createNodeLogger(configStore.configDir),
    })
    serverInstance = serve({
      fetch: appRuntime.app.fetch,
      port: TEST_PORT,
      hostname: '127.0.0.1',
    })

    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`${BASE_URL}/api/node-id`)
        if (response.ok) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    fullToken = (await createCredential()).token
  })

  after(async () => {
    await appRuntime?.closeMcp()
    await new Promise(resolve => serverInstance?.close(resolve))
    await engine?.stop()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('serves scoped resources and tools over Streamable HTTP', async () => {
    const { client, transport } = createHttpClient(fullToken)
    await client.connect(transport)
    try {
      assert.strictEqual(client.getProtocolEra(), 'modern')
      const { tools } = await client.listTools()
      const names = tools.map(tool => tool.name)
      assert.ok(names.includes('mostbox_node_status'))
      assert.ok(names.includes('mostbox_publish_local_file'))
      assert.ok(names.includes('mostbox_start_download'))
      assert.ok(!names.includes('mostbox_delete_file'))

      const result = await client.callTool({
        name: 'mostbox_node_status',
        arguments: {},
      })
      assert.strictEqual(result.isError, undefined)
      assert.strictEqual(result.structuredContent.status, 'online')

      const resources = await client.listResources()
      assert.ok(
        resources.resources.some(resource => resource.uri === 'mostbox://files')
      )
    } finally {
      await client.close()
    }
  })

  it('documents MCP administration APIs in OpenAPI', async () => {
    const response = await fetch(`${BASE_URL}/api/openapi.json`)
    assert.strictEqual(response.status, 200)
    const spec = await response.json()
    assert.ok(spec.paths['/api/admin/mcp/clients'])
    assert.ok(spec.paths['/api/admin/mcp/clients/{id}'])
    assert.ok(spec.paths['/api/mcp/me'])
    assert.ok(spec.paths['/api/mcp/publish-local'])
    assert.strictEqual(
      spec.components.securitySchemes.McpBearer.scheme,
      'bearer'
    )
  })

  it('publishes only allowed local files and returns the canonical link', async () => {
    const allowedFile = path.join(publishRoot, 'mcp-publish.txt')
    const outsideFile = path.join(outsideRoot, 'private.txt')
    fs.writeFileSync(allowedFile, 'MostBox MCP publish fixture')
    fs.writeFileSync(outsideFile, 'must not publish')

    const { client, transport } = createHttpClient(
      fullToken,
      'mcp-publish-test'
    )
    await client.connect(transport)
    try {
      const denied = await client.callTool({
        name: 'mostbox_publish_local_file',
        arguments: { path: outsideFile },
      })
      assert.strictEqual(denied.isError, true)
      assert.strictEqual(denied.structuredContent.code, 'PATH_SECURITY_ERROR')

      const published = await client.callTool({
        name: 'mostbox_publish_local_file',
        arguments: { path: allowedFile },
      })
      assert.strictEqual(published.isError, undefined)
      assert.match(published.structuredContent.cid, /^baf/)
      assert.match(published.structuredContent.link, /^most:\/\//)

      const files = await client.callTool({
        name: 'mostbox_list_files',
        arguments: { offset: 0, limit: 10 },
      })
      assert.ok(
        files.structuredContent.items.some(
          item => item.cid === published.structuredContent.cid
        )
      )

      const share = await client.callTool({
        name: 'mostbox_get_share_link',
        arguments: { cid: published.structuredContent.cid },
      })
      assert.strictEqual(
        share.structuredContent.link,
        published.structuredContent.link
      )
      assert.ok(
        engine
          .listHoldings()
          .some(holding => holding.cid === published.structuredContent.cid)
      )
    } finally {
      await client.close()
    }
  })

  it('limits the visible tool surface and direct API access by scope', async () => {
    const credential = await createCredential({
      name: 'Read node only',
      scopes: ['node:read'],
      allowedRoots: [],
    })
    const { client, transport } = createHttpClient(
      credential.token,
      'mcp-scope-test'
    )
    await client.connect(transport)
    try {
      const { tools } = await client.listTools()
      assert.deepStrictEqual(tools.map(tool => tool.name).sort(), [
        'mostbox_list_holdings',
        'mostbox_node_status',
      ])
    } finally {
      await client.close()
    }

    const forbidden = await fetch(`${BASE_URL}/api/files`, {
      headers: { Authorization: `Bearer ${credential.token}` },
    })
    assert.strictEqual(forbidden.status, 403)
    assert.strictEqual((await forbidden.json()).code, 'MCP_SCOPE_FORBIDDEN')

    const shutdown = await fetch(`${BASE_URL}/api/shutdown`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential.token}` },
    })
    assert.strictEqual(shutdown.status, 403)
    assert.strictEqual((await shutdown.json()).code, 'MCP_API_FORBIDDEN')
  })

  it('rejects non-loopback HTTP transport requests and revoked tokens', async () => {
    const remote = await appRuntime.app.request(
      '/mcp',
      {
        method: 'GET',
        headers: {
          host: `localhost:${TEST_PORT}`,
          Authorization: `Bearer ${fullToken}`,
        },
      },
      { incoming: { socket: { remoteAddress: '203.0.113.10' } } }
    )
    assert.strictEqual(remote.status, 403)
    assert.strictEqual((await remote.json()).code, 'MCP_LOOPBACK_REQUIRED')

    const invalidHost = await appRuntime.app.request(
      '/mcp',
      {
        method: 'GET',
        headers: {
          host: 'attacker.example',
          Authorization: `Bearer ${fullToken}`,
        },
      },
      LOCAL_CONTEXT
    )
    assert.strictEqual(invalidHost.status, 403)
    assert.strictEqual((await invalidHost.json()).code, 'MCP_HOST_FORBIDDEN')

    const invalidOrigin = await appRuntime.app.request(
      '/mcp',
      {
        method: 'GET',
        headers: {
          host: `localhost:${TEST_PORT}`,
          origin: 'https://attacker.example',
          Authorization: `Bearer ${fullToken}`,
        },
      },
      LOCAL_CONTEXT
    )
    assert.strictEqual(invalidOrigin.status, 403)
    assert.strictEqual(
      (await invalidOrigin.json()).code,
      'MCP_ORIGIN_FORBIDDEN'
    )

    const credential = await createCredential({
      name: 'Revocation test',
      scopes: ['node:read'],
      allowedRoots: [],
    })
    const revoke = await fetchAs(
      TEST_IDENTITY,
      `/api/admin/mcp/clients/${credential.client.id}`,
      { method: 'DELETE' }
    )
    assert.strictEqual(revoke.status, 200)
    const revokedTransport = await fetch(`${BASE_URL}/mcp`, {
      headers: { Authorization: `Bearer ${credential.token}` },
    })
    assert.strictEqual(revokedTransport.status, 401)
    const denied = await fetch(`${BASE_URL}/api/mcp/me`, {
      headers: { Authorization: `Bearer ${credential.token}` },
    })
    assert.strictEqual(denied.status, 401)
  })

  it('serves the same scoped tools through the CLI stdio bridge', async () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..'
    )
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repoRoot, 'server', 'cli.js'), 'mcp'],
      cwd: repoRoot,
      env: {
        ...getDefaultEnvironment(),
        MOSTBOX_URL: BASE_URL,
        MOSTBOX_MCP_TOKEN: fullToken,
      },
      stderr: 'pipe',
    })
    const client = new Client(
      { name: 'mostbox-mcp-stdio-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    )
    await client.connect(transport)
    try {
      const { tools } = await client.listTools()
      assert.ok(tools.some(tool => tool.name === 'mostbox_list_files'))
      const result = await client.callTool({
        name: 'mostbox_list_downloads',
        arguments: {},
      })
      assert.deepStrictEqual(result.structuredContent.items, [])
    } finally {
      await client.close()
    }
  })
})
