import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from '../../index.js'
import { calculateCid } from '../../src/core/cid.js'
import { MostBoxEngine } from '../../src/index.js'
import {
  GAME_CHANNEL_TYPE,
  gameRoomCodeToChannelName,
} from '../../src/core/gameRoom.js'
import { createNodeConfigStore } from '../../src/node/config.js'
import { createNodeLogger } from '../../src/node/logs.js'
import { buildAuthHeaders } from '../../src/utils/auth.js'
import { createLoginIdentity } from '../../src/utils/userIdentity.js'

const TEST_PORT = 19771
const baseUrl = 'http://localhost:' + TEST_PORT
const VALID_MISSING_CID =
  'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
const TEST_IDENTITY = createLoginIdentity('api-user', 'api-password')
const SECOND_IDENTITY = createLoginIdentity('second-user', 'second-password')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function assertNoLegacyNodeSettingFields(value) {
  const legacyPattern = /Seed|Concurrent|RateLimit/
  assert.deepStrictEqual(
    Object.keys(value).filter(key => legacyPattern.test(key)),
    []
  )
}

describe('HTTP API (integration)', { timeout: 180000 }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-api-test-'))
  const uid = Math.random().toString(36).slice(2, 8)
  let serverInstance
  let engine
  let configStore
  let nodeLogger
  let originalProcessExit
  let originalFetch

  async function buildTestAuthHeaders(input, init = {}) {
    const method = init.method || 'GET'
    const path = new URL(String(input), baseUrl).pathname
    return buildAuthHeaders(TEST_IDENTITY, method, path)
  }

  async function fetchWithoutAuth(input, init = {}) {
    return originalFetch(input, init)
  }

  async function fetchAs(identity, input, init = {}) {
    const headers = new Headers(init.headers || {})
    const method = init.method || 'GET'
    const path = new URL(String(input), baseUrl).pathname
    const authHeaders = await buildAuthHeaders(identity, method, path)
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value)
    }
    return originalFetch(input, { ...init, headers })
  }

  async function requestWithAuth(app, path, init = {}) {
    const headers = new Headers(init.headers || {})
    const authHeaders = await buildAuthHeaders(
      TEST_IDENTITY,
      init.method || 'GET',
      path
    )
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value)
    }
    return app.request(path, { ...init, headers })
  }

  before(async () => {
    originalProcessExit = process.exit
    process.exit = () => {}
    originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init = {}) => {
      const headers = new Headers(init.headers || {})
      const url = String(input)
      if (url.includes('/api/')) {
        const authHeaders = await buildTestAuthHeaders(input, init)
        for (const [key, value] of Object.entries(authHeaders)) {
          headers.set(key, value)
        }
      }
      return originalFetch(input, { ...init, headers })
    }

    const dataPath = path.join(tmpDir, 'api')
    fs.mkdirSync(dataPath, { recursive: true })
    engine = new MostBoxEngine({ dataPath })
    await engine.start()
    const publishFile = engine.publishFile.bind(engine)
    engine.publishFile = (content, fileName, options = {}) =>
      publishFile(content, fileName, {
        ownerAddress: TEST_IDENTITY.address,
        ...options,
      })
    const createChannel = engine.createChannel.bind(engine)
    engine.createChannel = (name, type = 'personal', options = {}) =>
      createChannel(name, type, {
        ownerAddress: TEST_IDENTITY.address,
        ...options,
      })
    const deletePublishedFile = engine.deletePublishedFile.bind(engine)
    engine.deletePublishedFile = (cid, options = {}) =>
      deletePublishedFile(cid, {
        ownerAddress: TEST_IDENTITY.address,
        ...options,
      })
    const permanentDeleteTrashFile =
      engine.permanentDeleteTrashFile.bind(engine)
    engine.permanentDeleteTrashFile = (cid, options = {}) =>
      permanentDeleteTrashFile(cid, {
        ownerAddress: TEST_IDENTITY.address,
        ...options,
      })
    configStore = createNodeConfigStore(path.join(tmpDir, 'config'))
    nodeLogger = createNodeLogger(configStore.configDir)

    const { app } = createApp(engine, {
      port: TEST_PORT,
      configStore,
      nodeLogger,
    })

    serverInstance = serve({
      fetch: app.fetch,
      port: TEST_PORT,
      hostname: 'localhost',
    })

    let ready = false
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`${baseUrl}/api/node-id`)
        if (res.status === 200) {
          ready = true
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 100))
    }
    if (!ready) throw new Error('Server failed to start')
  })

  after(async () => {
    if (serverInstance) {
      serverInstance.close()
    }
    if (engine) {
      await engine.stop()
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.exit = originalProcessExit
    globalThis.fetch = originalFetch
  })

  beforeEach(async () => {
    await engine.clearUserData(TEST_IDENTITY.address)
    await engine.clearUserData(SECOND_IDENTITY.address)
    const channels = [
      ...engine.listChannels(),
      ...engine.listChannels({ type: 'game' }),
    ]
    for (const channel of channels) {
      await engine.leaveChannel(channel.name)
    }
  })

  describe('GET /api/node-id', () => {
    it('returns a node ID', async () => {
      const res = await fetch(`${baseUrl}/api/node-id`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.id)
      assert.ok(/^[0-9a-f]+$/i.test(data.id))
    })

    it('allows private network preflight from most.box', async () => {
      const res = await fetchWithoutAuth(`${baseUrl}/api/node-id`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://most.box',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Private-Network': 'true',
        },
      })

      assert.strictEqual(res.status, 204)
      assert.strictEqual(
        res.headers.get('access-control-allow-origin'),
        'https://most.box'
      )
      assert.strictEqual(
        res.headers.get('access-control-allow-private-network'),
        'true'
      )
    })

    it('allows private network preflight from most-people.com', async () => {
      const res = await fetchWithoutAuth(`${baseUrl}/api/node-id`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://most-people.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Private-Network': 'true',
        },
      })

      assert.strictEqual(res.status, 204)
      assert.strictEqual(
        res.headers.get('access-control-allow-origin'),
        'https://most-people.com'
      )
      assert.strictEqual(
        res.headers.get('access-control-allow-private-network'),
        'true'
      )
    })
  })

  describe('node daemon management API', () => {
    it('returns node status for the Web admin console', async () => {
      const res = await fetch(`${baseUrl}/api/node/status`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.status, 'online')
      assert.ok(data.nodeId)
      assert.strictEqual(data.port, TEST_PORT)
      assert.strictEqual(data.host, '127.0.0.1')
      assert.strictEqual(data.config.host, '127.0.0.1')
      assert.strictEqual(data.config.port, 1976)
      assert.strictEqual(data.config.maxFileSizeBytes, 10 * 1024 * 1024 * 1024)
      assert.ok(Array.isArray(data.listen.addresses))
      assert.strictEqual(typeof data.capacity.configuredBytes, 'number')
      assert.ok(Array.isArray(data.holdings))
      assert.strictEqual('remoteInvites' in data.config, false)
      assert.strictEqual(typeof data.config.remoteInviteCount, 'number')
      assert.deepStrictEqual(Object.keys(data.policy).sort(), [
        'maxFileSizeBytes',
      ])
      assertNoLegacyNodeSettingFields(data.policy)
      assert.strictEqual('allowOrders' in data.policy, false)
      assert.strictEqual('minimumPriceUsdtPerGbMonth' in data.policy, false)
    })

    it('saves daemon config and exposes policy locally', async () => {
      const dataPath = path.join(tmpDir, 'saved-node-data')
      fs.mkdirSync(dataPath, { recursive: true })

      const res = await fetch(`${baseUrl}/api/node/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataPath,
          host: '0.0.0.0',
          port: 1999,
          capacityBytes: 1024 * 1024 * 1024,
          maxFileSizeBytes: 1024 * 1024,
          remoteInvites: ['invite-one', 'invite-two', 'invite-one'],
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.dataPath, dataPath)
      assert.strictEqual(data.host, '0.0.0.0')
      assert.strictEqual(data.port, 1976)
      assert.strictEqual(data.capacityBytes, 1024 * 1024 * 1024)
      assert.strictEqual(data.maxFileSizeBytes, 1024 * 1024)
      assert.deepStrictEqual(data.remoteInvites, ['invite-one', 'invite-two'])
      assertNoLegacyNodeSettingFields(data)
      assert.strictEqual('allowOrders' in data, false)
      assert.strictEqual('minimumPriceUsdtPerGbMonth' in data, false)

      const policyRes = await fetch(`${baseUrl}/api/node/policy/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: 2 * 1024 * 1024,
        }),
      })
      const decision = await policyRes.json()

      assert.strictEqual(policyRes.status, 200)
      assert.strictEqual(decision.accepted, false)
      assert.ok(decision.reasons.includes('file-too-large'))
      assertNoLegacyNodeSettingFields(decision.policy)
      assert.strictEqual('offeredPriceUsdtPerGbMonth' in decision.policy, false)
      assert.strictEqual('allowOrders' in decision.policy, false)
    })

    it('uses saved remote invites for remote access checks', async () => {
      const { success } = configStore.saveNodeConfigPatch({
        remoteInvites: ['saved-invite'],
      })
      assert.strictEqual(success, true)

      const { app } = createApp(engine, {
        port: TEST_PORT + 12,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
      })

      const rejected = await app.request('/api/node-id', {
        headers: { host: '203.0.113.10:1976' },
      })
      const rejectedData = await rejected.json()
      assert.strictEqual(rejected.status, 403)
      assert.strictEqual(rejectedData.code, 'INVALID_INVITE')

      const accepted = await app.request('/api/node-id', {
        headers: {
          host: '203.0.113.10:1976',
          'x-mostbox-invite': 'saved-invite',
        },
      })
      const acceptedData = await accepted.json()
      assert.strictEqual(accepted.status, 200)
      assert.ok(acceptedData.id)
    })

    it('allows most.box to use a localhost daemon without a remote invite', async () => {
      const { success } = configStore.saveNodeConfigPatch({
        remoteInvites: ['saved-invite'],
      })
      assert.strictEqual(success, true)

      const { app } = createApp(engine, {
        port: TEST_PORT + 13,
        host: '127.0.0.1',
        configStore,
        nodeLogger,
      })

      const res = await app.request('/api/node-id', {
        headers: {
          host: 'localhost:1976',
          origin: 'https://most.box',
        },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.id)
    })

    it('allows most-people.com to use a localhost daemon without a remote invite', async () => {
      const { success } = configStore.saveNodeConfigPatch({
        remoteInvites: ['saved-invite'],
      })
      assert.strictEqual(success, true)

      const { app } = createApp(engine, {
        port: TEST_PORT + 14,
        host: '127.0.0.1',
        configStore,
        nodeLogger,
      })

      const res = await app.request('/api/node-id', {
        headers: {
          host: 'localhost:1976',
          origin: 'https://most-people.com',
        },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.id)
    })

    it('returns node logs and OpenAPI spec', async () => {
      await fetch(`${baseUrl}/api/node/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxFileSizeBytes: 2 * 1024 * 1024 }),
      })

      const logsRes = await fetch(`${baseUrl}/api/node/logs?limit=20`)
      const logsData = await logsRes.json()

      assert.strictEqual(logsRes.status, 200)
      assert.ok(Array.isArray(logsData.logs))
      assert.ok(logsData.logs.some(log => log.event === 'node:policy:updated'))

      const specRes = await fetch(`${baseUrl}/api/openapi.json`)
      const spec = await specRes.json()

      assert.strictEqual(specRes.status, 200)
      assert.strictEqual(spec.openapi, '3.1.0')
      assert.ok(spec.paths['/api/node/status'])
      assert.ok(spec.paths['/api/node/logs'])
      assert.ok(spec.paths['/api/node/logs'].delete)
      assert.ok(spec.paths['/api/node/diagnostics'])
      assert.ok(spec.paths['/api/node/policy'])
      assert.ok(spec.paths['/api/files'])
      assert.ok(spec.paths['/api/publish'])
      assert.ok(spec.paths['/api/download/check'])
      assert.ok(spec.paths['/api/download'])
      assert.ok(spec.paths['/api/download/cancel'])
      assert.ok(spec.paths['/api/files/{cid}/download'])
      assert.ok(spec.paths['/api/channels'])
      assert.ok(spec.paths['/api/channels'].get)
      assert.ok(spec.paths['/api/channels'].post)
      assert.ok(spec.paths['/api/channels'].delete)
      assert.ok(spec.paths['/api/channels/{name}/messages'])
      assert.ok(spec.paths['/api/channels/{name}/messages'].get)
      assert.ok(spec.paths['/api/channels/{name}/messages'].post)
      assert.ok(spec.paths['/api/channels/{name}/members'])
      assert.ok(spec.paths['/api/channels/{name}/peers'])
      assert.ok(spec.paths['/api/channels/{name}/remark'])
      assert.ok(spec.paths['/api/channels/{name}/pin'])

      const clearRes = await fetch(`${baseUrl}/api/node/logs`, {
        method: 'DELETE',
      })
      const clearData = await clearRes.json()

      assert.strictEqual(clearRes.status, 200)
      assert.strictEqual(clearData.success, true)

      const emptyLogsRes = await fetch(`${baseUrl}/api/node/logs?limit=20`)
      const emptyLogsData = await emptyLogsRes.json()

      assert.strictEqual(emptyLogsRes.status, 200)
      assert.deepStrictEqual(emptyLogsData.logs, [])
    })

    it('filters node logs by Alpha diagnostic category', async () => {
      nodeLogger.clear()
      nodeLogger.append({
        event: 'node:topic:joined',
        message: 'CID topic joined',
      })
      nodeLogger.append({
        level: 'error',
        event: 'node:pull:error',
        message: 'P2P pull failed',
      })
      nodeLogger.append({
        event: 'node:download:success',
        message: 'Download verified and stored',
      })

      const pullRes = await fetch(`${baseUrl}/api/node/logs?filter=pull`)
      const pullData = await pullRes.json()
      assert.strictEqual(pullRes.status, 200)
      assert.deepStrictEqual(
        pullData.logs.map(log => log.event),
        ['node:pull:error']
      )

      const verifyRes = await fetch(`${baseUrl}/api/node/logs?filter=verify`)
      const verifyData = await verifyRes.json()
      assert.strictEqual(verifyRes.status, 200)
      assert.deepStrictEqual(
        verifyData.logs.map(log => log.event),
        ['node:download:success']
      )

      const errorRes = await fetch(`${baseUrl}/api/node/logs?filter=error`)
      const errorData = await errorRes.json()
      assert.strictEqual(errorRes.status, 200)
      assert.deepStrictEqual(
        errorData.logs.map(log => log.event),
        ['node:pull:error']
      )
    })

    it('exports a sanitized diagnostics snapshot', async () => {
      const res = await fetch(`${baseUrl}/api/node/diagnostics`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.generatedAt)
      assert.strictEqual(typeof data.packageVersion, 'string')
      assert.strictEqual(data.status.status, 'online')
      assert.ok(Array.isArray(data.status.holdings))
      assert.ok(Array.isArray(data.logs))
      assert.strictEqual('remoteInvites' in data.status.config, false)
    })
  })

  describe('GET /api/files', () => {
    it('requires login for file APIs', async () => {
      const res = await fetchWithoutAuth(`${baseUrl}/api/files`)
      const data = await res.json()
      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('returns empty array initially', async () => {
      const res = await fetch(`${baseUrl}/api/files`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })

    it('only returns files owned by the logged-in user', async () => {
      const first = await engine.publishFile(Buffer.from('first'), 'first.txt')
      const second = await engine.publishFile(
        Buffer.from('second'),
        'second.txt',
        { ownerAddress: SECOND_IDENTITY.address }
      )

      const firstRes = await fetch(`${baseUrl}/api/files`)
      const firstData = await firstRes.json()
      assert.strictEqual(firstRes.status, 200)
      assert.ok(firstData.some(file => file.cid === first.cid))
      assert.ok(!firstData.some(file => file.cid === second.cid))

      const secondRes = await fetchAs(SECOND_IDENTITY, `${baseUrl}/api/files`)
      const secondData = await secondRes.json()
      assert.strictEqual(secondRes.status, 200)
      assert.ok(secondData.some(file => file.cid === second.cid))
      assert.ok(!secondData.some(file => file.cid === first.cid))
    })
  })

  describe('POST /api/publish', () => {
    it('publishes a file via multipart form', async () => {
      const boundary = '----TestBoundary123'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.txt"',
        'Content-Type: text/plain',
        '',
        'hello world from API test',
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(data.cid)
      assert.ok(data.link.startsWith('most://'))
      assert.strictEqual(data.fileName, 'test.txt')
    })

    it('returns 400 when no file provided', async () => {
      const boundary = '----TestBoundary123'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="notfile"',
        '',
        'test',
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      })

      assert.strictEqual(res.status, 400)
    })

    it('handles Chinese filename in multipart form', async () => {
      const boundary = '----TestBoundary456'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="测试文件.txt"',
        'Content-Type: text/plain',
        '',
        'hello world from Chinese filename test',
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.fileName, '测试文件.txt')
    })

    it('preserves chat attachment folder paths in multipart filename', async () => {
      const boundary = '----TestBoundaryChatAttachment'
      const fileName = 'chat-file/general/photo.png'
      const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
        'Content-Type: image/png',
        '',
        'fake png bytes for chat attachment path test',
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(`${baseUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.fileName, fileName)
      assert.strictEqual(
        data.link,
        `most://${data.cid}?filename=${encodeURIComponent(fileName)}`
      )
    })
  })

  describe('POST /api/download', () => {
    it('checks an existing link before download', async () => {
      const publishResult = await engine.publishFile(
        Buffer.from('check-download'),
        'check-download.txt'
      )

      const res = await fetch(`${baseUrl}/api/download/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: publishResult.link }),
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.available, true)
      assert.strictEqual(data.alreadyExists, true)
      assert.strictEqual(data.cid, publishResult.cid)
    })

    it('checks a bare most link with CID as the fallback filename', async () => {
      const publishResult = await engine.publishFile(
        Buffer.from('check-bare-download'),
        'check-bare-download.txt'
      )

      const res = await fetch(`${baseUrl}/api/download/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: `most://${publishResult.cid}` }),
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.available, true)
      assert.strictEqual(data.alreadyExists, true)
      assert.strictEqual(data.cid, publishResult.cid)
      assert.strictEqual(data.fileName, publishResult.cid)
    })

    it('checks remote availability without starting a download task', async () => {
      let checked = false
      let startedDownload = false
      const fakeEngine = {
        getLocalCidAvailability: async () => null,
        hasDownloadNameConflict: () => false,
        checkDownloadAvailability: async link => {
          checked = true
          return {
            available: true,
            cid: VALID_MISSING_CID,
            fileName: new URL(link).searchParams.get('filename'),
            size: 12,
          }
        },
        downloadFile: async () => {
          startedDownload = true
        },
      }
      const { app } = createApp(fakeEngine, {
        port: TEST_PORT + 4,
        configStore,
        nodeLogger,
      })

      const res = await requestWithAuth(app, '/api/download/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: `most://${VALID_MISSING_CID}?filename=remote.txt`,
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.available, true)
      assert.strictEqual(data.fileName, 'remote.txt')
      assert.strictEqual(checked, true)
      assert.strictEqual(startedDownload, false)
    })

    it('returns taskId for valid link', async () => {
      const published = await engine.publishFile(
        Buffer.from('test'),
        'dl-test.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )

      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: published.link }),
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(data.taskId)
      assert.strictEqual(data.alreadyExists, true)
    })

    it('uses engine download path for existing files', async () => {
      let called = false
      const fakeEngine = {
        getLocalCidAvailability: async () => ({
          cid: VALID_MISSING_CID,
          fileName: 'exists.txt',
          size: 6,
          alreadyExists: true,
        }),
        downloadFile: async (_link, taskId) => {
          called = true
          return { taskId, fileName: 'exists.txt', alreadyExists: true }
        },
      }
      const { app } = createApp(fakeEngine, {
        port: TEST_PORT + 3,
        configStore,
        nodeLogger,
      })

      const res = await requestWithAuth(app, '/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: `most://${VALID_MISSING_CID}?filename=exists.txt`,
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.alreadyExists, true)
      assert.strictEqual(called, true)
    })

    it('uses local CID availability before filename conflict checks', async () => {
      const publishResult = await engine.publishFile(
        Buffer.from('cid-first chat attachment'),
        '#18.txt'
      )
      const chatFileName = `chat-file/${uid}/#18.txt`
      const downloadPath = path.join(tmpDir, 'api', 'downloads', chatFileName)
      fs.mkdirSync(path.dirname(downloadPath), { recursive: true })
      fs.writeFileSync(downloadPath, 'same target name')

      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: `most://${publishResult.cid}?filename=${encodeURIComponent(chatFileName)}`,
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.alreadyExists, true)
      assert.strictEqual(data.fileName, chatFileName)
    })

    it('returns 409 when another CID would save over an existing filename', async () => {
      const downloadsDir = path.join(tmpDir, 'api', 'downloads')
      fs.mkdirSync(downloadsDir, { recursive: true })
      fs.writeFileSync(path.join(downloadsDir, 'same-name.txt'), 'local file')

      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: `most://${VALID_MISSING_CID}?filename=same-name.txt`,
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 409)
      assert.strictEqual(data.code, 'CONFLICT')
      assert.match(data.error, /已有同名文件/)
    })

    it('returns 400 for missing link', async () => {
      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 400)
      const data = await res.json()
      assert.ok(data.error.includes('link'))
    })

    it('returns 400 for invalid CID', async () => {
      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: 'most://invalid-cid' }),
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('node holdings and P2P pull API', () => {
    it('requires login before pulling by CID', async () => {
      const res = await fetchWithoutAuth(`${baseUrl}/api/p2p/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: VALID_MISSING_CID }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('lists node holdings after publish', async () => {
      const publishResult = await engine.publishFile(
        Buffer.from('api-holding'),
        'api-holding.txt'
      )

      const res = await fetch(`${baseUrl}/api/node/holdings`)
      const data = await res.json()
      const holding = data.find(item => item.cid === publishResult.cid)

      assert.strictEqual(res.status, 200)
      assert.ok(holding)
      assert.strictEqual(holding.size, 'api-holding'.length)
      assert.match(holding.topic, /^[0-9a-f]{64}$/)
      assert.strictEqual(holding.joined, true)
      assert.strictEqual(holding.seedStatus, 'active')
      assert.strictEqual(typeof holding.peerCount, 'number')
      assert.strictEqual(holding.lastServedAt, null)
      assert.strictEqual(holding.totalServedBytes, 0)
    })

    it('creates a manual holding record', async () => {
      const content = Buffer.from('manual holding')
      const { cid } = await calculateCid(content)

      const res = await fetch(`${baseUrl}/api/node/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: cid.toString(),
          size: content.length,
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.holding.cid, cid.toString())
      assert.strictEqual(data.holding.joined, true)
    })

    it('normalizes manual holding driveName from the CID', async () => {
      const content = Buffer.from('api manual driveName normalization')
      const { cid } = await calculateCid(content)

      const res = await fetch(`${baseUrl}/api/node/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: cid.toString(),
          fileName: 'manual-drive.txt',
          size: content.length,
          driveName: 'drive-not-from-cid',
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.match(data.holding.driveName, /^drive-[0-9a-f]{64}$/)
      assert.notStrictEqual(data.holding.driveName, 'drive-not-from-cid')
      assert.strictEqual(data.holding.driveName, `drive-${data.holding.topic}`)
    })

    it('passes the authenticated user to P2P pull downloads', async () => {
      const originalPullByCid = engine.pullByCid
      let capturedInput = null

      engine.pullByCid = async input => {
        capturedInput = input
        return {
          taskId: 'captured-pull',
          fileName: 'captured.txt',
          cid: input.cid,
        }
      }

      try {
        const res = await fetchAs(SECOND_IDENTITY, `${baseUrl}/api/p2p/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cid: VALID_MISSING_CID,
            fileName: 'captured.txt',
          }),
        })
        const data = await res.json()

        assert.strictEqual(res.status, 200)
        assert.strictEqual(data.success, true)
        assert.strictEqual(data.cid, VALID_MISSING_CID)
        assert.ok(capturedInput)
        assert.strictEqual(
          capturedInput.ownerAddress,
          SECOND_IDENTITY.address.toLowerCase()
        )
      } finally {
        engine.pullByCid = originalPullByCid
      }
    })

    it('allows authenticated P2P pull downloads to be deleted from holdings', async () => {
      const pullTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'most-api-pull-delete-')
      )
      let publisher
      let replication

      try {
        publisher = new MostBoxEngine({
          dataPath: path.join(pullTmpDir, 'publisher'),
          downloadTimeout: 10000,
        })
        await publisher.start()

        const content = Buffer.from('api pull delete ownership')
        const publishResult = await publisher.publishFile(
          content,
          'api-pull-delete.txt'
        )

        const pullPromise = fetch(`${baseUrl}/api/p2p/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            link: publishResult.link,
            timeout: 10000,
          }),
        })
        await sleep(100)
        replication = publisher.replicateWith(engine)

        const pullRes = await pullPromise
        const pullData = await pullRes.json()
        assert.strictEqual(pullRes.status, 200)
        assert.strictEqual(pullData.success, true)
        assert.strictEqual(pullData.cid, publishResult.cid)

        const filesRes = await fetch(`${baseUrl}/api/files`)
        const files = await filesRes.json()
        assert.ok(files.some(file => file.cid === publishResult.cid))

        const deleteRes = await fetch(
          `${baseUrl}/api/files/${publishResult.cid}`,
          { method: 'DELETE' }
        )
        assert.strictEqual(deleteRes.status, 200)

        const permanentDeleteRes = await fetch(
          `${baseUrl}/api/trash/${publishResult.cid}`,
          { method: 'DELETE' }
        )
        assert.strictEqual(permanentDeleteRes.status, 200)

        const holdingsRes = await fetch(`${baseUrl}/api/node/holdings`)
        const holdings = await holdingsRes.json()
        assert.ok(
          !holdings.some(holding => holding.cid === publishResult.cid)
        )
      } finally {
        replication?.close()
        if (publisher) await publisher.stop().catch(() => {})
        fs.rmSync(pullTmpDir, { recursive: true, force: true })
      }
    })

    it('returns PEER_NOT_FOUND when no peer serves the CID', async () => {
      const content = Buffer.from('missing p2p content')
      const { cid } = await calculateCid(content)

      const res = await fetch(`${baseUrl}/api/p2p/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: cid.toString(),
          fileName: 'missing.txt',
          timeout: 100,
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 503)
      assert.strictEqual(data.code, 'PEER_NOT_FOUND')
    })

    it('returns INTEGRITY_ERROR explicitly', async () => {
      const fakeEngine = {
        pullByCid: async () => {
          const err = new Error('File content CID mismatch')
          err.code = 'INTEGRITY_ERROR'
          throw err
        },
      }
      const { app } = createApp(fakeEngine, {
        port: TEST_PORT + 1,
        configStore,
        nodeLogger,
      })

      const res = await requestWithAuth(app, '/api/p2p/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 422)
      assert.strictEqual(data.code, 'INTEGRITY_ERROR')
    })

    it('returns ENGINE_NOT_INITIALIZED when the node is stopped', async () => {
      const stoppedEngine = new MostBoxEngine({
        dataPath: path.join(tmpDir, 'stopped-engine'),
      })
      const { app } = createApp(stoppedEngine, {
        port: TEST_PORT + 2,
        configStore,
        nodeLogger,
      })

      const res = await requestWithAuth(app, '/api/p2p/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: 'bafkreidontexist' }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 503)
      assert.strictEqual(data.code, 'ENGINE_NOT_INITIALIZED')
    })
  })

  describe('POST /api/download/cancel', () => {
    it('cancels a download by taskId', async () => {
      const res = await fetch(`${baseUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'fake-task-id' }),
      })

      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(data.success)
    })

    it('returns 400 for missing taskId', async () => {
      const res = await fetch(`${baseUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 400)
    })
  })

  describe('DELETE /api/files/:cid', () => {
    it('moves file to trash', async () => {
      const pub = await engine.publishFile(
        Buffer.from('delete-test'),
        'delete.txt'
      )
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/files/${cid}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.ok(!data.some(f => f.cid === cid))
    })
  })

  describe('POST /api/move', () => {
    it('renames a file', async () => {
      const pub = await engine.publishFile(Buffer.from('move-test'), 'old.txt')
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, newFileName: 'new.txt' }),
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.fileName, 'new.txt')
    })

    it('returns 400 for missing params', async () => {
      const res = await fetch(`${baseUrl}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: 'abc' }),
      })

      assert.strictEqual(res.status, 400)
    })

    it('returns 409 when moving onto an existing same-folder name', async () => {
      await engine.publishFile(Buffer.from('api move conflict one'), 'api/a.txt')
      const second = await engine.publishFile(
        Buffer.from('api move conflict two'),
        'api/b.txt'
      )

      const res = await fetch(`${baseUrl}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: second.cid, newFileName: 'api/a.txt' }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 409)
      assert.strictEqual(data.code, 'CONFLICT')
    })
  })

  describe('POST /api/folder/rename', () => {
    it('renames a folder', async () => {
      await engine.publishFile(Buffer.from('f1'), 'folder/file1.txt')
      await engine.publishFile(Buffer.from('f2'), 'folder/file2.txt')

      const res = await fetch(`${baseUrl}/api/folder/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: 'folder', newPath: 'new-folder' }),
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.files.length, 2)
    })
  })

  describe('GET /api/files/:cid/download', () => {
    it('serves file content', async () => {
      const pub = await engine.publishFile(
        Buffer.from('download-content'),
        'serve.txt'
      )
      const cid = pub.cid

      const res = await fetch(`${baseUrl}/api/files/${cid}/download`)
      assert.strictEqual(res.status, 200)
      const text = await res.text()
      assert.strictEqual(text, 'download-content')
    })

    it('returns 404 for non-existent CID', async () => {
      const res = await fetch(
        `${baseUrl}/api/files/${VALID_MISSING_CID}/download`
      )
      assert.strictEqual(res.status, 404)
    })
  })

  describe('POST /api/files/:cid/star', () => {
    it('toggles starred status', async () => {
      const published = await engine.publishFile(
        Buffer.from('test'),
        'star-test.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )

      const res = await fetch(`${baseUrl}/api/files/${published.cid}/star`, {
        method: 'POST',
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(data.starred)
    })
  })

  describe('GET /api/trash', () => {
    it('returns trash files', async () => {
      const published = await engine.publishFile(
        Buffer.from('trash-test'),
        'trash.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )
      await engine.deletePublishedFile(published.cid, {
        ownerAddress: TEST_IDENTITY.address,
      })

      const res = await fetch(`${baseUrl}/api/trash`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 1)
      assert.strictEqual(data[0].fileName, 'trash.txt')
    })
  })

  describe('POST /api/trash/:cid/restore', () => {
    it('restores file from trash', async () => {
      const published = await engine.publishFile(
        Buffer.from('restore-test'),
        'restore.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )
      const cid = published.cid
      await engine.deletePublishedFile(cid, {
        ownerAddress: TEST_IDENTITY.address,
      })

      const res = await fetch(`${baseUrl}/api/trash/${cid}/restore`, {
        method: 'POST',
      })

      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(
        engine.listTrashFiles({ ownerAddress: TEST_IDENTITY.address }).length,
        0
      )
    })
  })

  describe('DELETE /api/trash/:cid', () => {
    it('permanently deletes a trash file', async () => {
      const published = await engine.publishFile(
        Buffer.from('perm-delete'),
        'perm.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )
      const cid = published.cid
      await engine.deletePublishedFile(cid, {
        ownerAddress: TEST_IDENTITY.address,
      })

      const res = await fetch(`${baseUrl}/api/trash/${cid}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(
        engine.listTrashFiles({ ownerAddress: TEST_IDENTITY.address }).length,
        0
      )
    })
  })

  describe('DELETE /api/trash', () => {
    it('empties the trash', async () => {
      const first = await engine.publishFile(
        Buffer.from('empty1'),
        'empty1.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )
      const second = await engine.publishFile(
        Buffer.from('empty2'),
        'empty2.txt',
        { ownerAddress: TEST_IDENTITY.address }
      )
      await engine.deletePublishedFile(first.cid, {
        ownerAddress: TEST_IDENTITY.address,
      })
      await engine.deletePublishedFile(second.cid, {
        ownerAddress: TEST_IDENTITY.address,
      })

      const res = await fetch(`${baseUrl}/api/trash`, { method: 'DELETE' })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(
        engine.listTrashFiles({ ownerAddress: TEST_IDENTITY.address }).length,
        0
      )
    })
  })

  describe('admin user data API', () => {
    it('does not expose hidden user sync APIs', async () => {
      for (const pathName of [
        '/api/user/sync/start',
        '/api/user/sync/status',
      ]) {
        const res = await fetchAs(TEST_IDENTITY, `${baseUrl}${pathName}`, {
          method: pathName.endsWith('/start') ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: pathName.endsWith('/start') ? JSON.stringify({}) : undefined,
        })
        assert.strictEqual(res.status, 404)
      }
    })

    it('requires authentication for user account metadata APIs', async () => {
      const getRes = await fetchWithoutAuth(`${baseUrl}/api/user/profile`)
      assert.strictEqual(getRes.status, 401)

      const putRes = await fetchWithoutAuth(`${baseUrl}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'No Auth',
          avatar: '',
          updatedAt: Date.now(),
        }),
      })
      assert.strictEqual(putRes.status, 401)

      const exportRes = await fetchWithoutAuth(`${baseUrl}/api/user/export`)
      assert.strictEqual(exportRes.status, 401)

      const importRes = await fetchWithoutAuth(`${baseUrl}/api/user/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert.strictEqual(importRes.status, 401)
    })

    it('saves and reads authenticated local profile metadata', async () => {
      const updatedAt = Date.now()
      const putRes = await fetchAs(
        TEST_IDENTITY,
        `${baseUrl}/api/user/profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: 'Backed Up API User',
            avatar: '/avatars/default/panda.svg',
            updatedAt,
          }),
        }
      )
      const putData = await putRes.json()
      assert.strictEqual(putRes.status, 200)
      assert.strictEqual(putData.success, true)
      assert.strictEqual(putData.profile.displayName, 'Backed Up API User')
      assert.strictEqual(putData.profile.avatar, '/avatars/default/panda.svg')
      assert.strictEqual(putData.profile.updatedAt, updatedAt)

      const getRes = await fetchAs(
        TEST_IDENTITY,
        `${baseUrl}/api/user/profile`
      )
      const getData = await getRes.json()
      assert.strictEqual(getRes.status, 200)
      assert.strictEqual(getData.displayName, 'Backed Up API User')
      assert.strictEqual(getData.avatar, '/avatars/default/panda.svg')
      assert.strictEqual(getData.updatedAt, updatedAt)
    })

    it('exports sanitized account metadata for encrypted backup', async () => {
      const published = await engine.publishFile(
        Buffer.from('backup export'),
        `backup-export-${uid}.txt`,
        { ownerAddress: TEST_IDENTITY.address }
      )
      const channel = await engine.createChannel(`backup-${uid}`, 'personal', {
        ownerAddress: TEST_IDENTITY.address,
        displayName: 'Backup User',
      })
      await engine.setChannelRemark(channel.channelKey, 'backup remark', {
        ownerAddress: TEST_IDENTITY.address,
      })

      const res = await fetchAs(TEST_IDENTITY, `${baseUrl}/api/user/export`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.type, 'mostbox.account-backup')
      assert.strictEqual(data.schemaVersion, 1)
      assert.strictEqual(
        data.ownerAddress,
        TEST_IDENTITY.address.toLowerCase()
      )
      assert.ok(data.files.some(file => file.cid === published.cid))
      assert.ok(data.channels.some(item => item.channelKey === channel.channelKey))
      assert.strictEqual(JSON.stringify(data).includes(TEST_IDENTITY.danger), false)
      assert.strictEqual(JSON.stringify(data).includes(tmpDir), false)
    })

    it('imports same-owner account metadata without file content', async () => {
      const updatedAt = Date.now() + 10_000
      const payload = {
        type: 'mostbox.account-backup',
        schemaVersion: 1,
        ownerAddress: TEST_IDENTITY.address,
        exportedAt: new Date(updatedAt).toISOString(),
        profile: {
          displayName: 'Imported API User',
          avatar: '',
          updatedAt,
        },
        files: [
          {
            cid: VALID_MISSING_CID,
            fileName: `imported-${uid}.txt`,
            size: 123,
            source: 'synced',
            publishedAt: new Date(updatedAt).toISOString(),
            starred: true,
            updatedAt,
          },
        ],
        trashFiles: [],
        channels: [],
      }

      const res = await fetchAs(TEST_IDENTITY, `${baseUrl}/api/user/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.result.profileUpdated, true)
      assert.strictEqual(data.result.filesAdded, 1)

      const files = engine.listPublishedFiles({
        ownerAddress: TEST_IDENTITY.address,
      })
      const imported = files.find(file => file.cid === VALID_MISSING_CID)
      assert.ok(imported)
      assert.strictEqual(imported.localAvailable, false)
      assert.strictEqual(
        engine.getUserProfile(TEST_IDENTITY.address).displayName,
        'Imported API User'
      )
    })

    it('rejects account metadata imports for another owner', async () => {
      const res = await fetchAs(TEST_IDENTITY, `${baseUrl}/api/user/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mostbox.account-backup',
          schemaVersion: 1,
          ownerAddress: SECOND_IDENTITY.address,
          exportedAt: new Date().toISOString(),
          notes: [],
          files: [],
          trashFiles: [],
          channels: [],
        }),
      })
      assert.strictEqual(res.status, 403)
    })

    it('clears one user without removing another user records', async () => {
      const first = await engine.publishFile(Buffer.from('first'), 'first.txt')
      const second = await engine.publishFile(
        Buffer.from('second'),
        'second.txt',
        { ownerAddress: SECOND_IDENTITY.address }
      )

      const listRes = await fetch(`${baseUrl}/api/admin/users`)
      const listData = await listRes.json()
      assert.strictEqual(listRes.status, 200)
      assert.ok(
        listData.users.some(
          user => user.address === TEST_IDENTITY.address.toLowerCase()
        )
      )

      const clearRes = await fetch(
        `${baseUrl}/api/admin/users/${TEST_IDENTITY.address}/data`,
        { method: 'DELETE' }
      )
      assert.strictEqual(clearRes.status, 200)

      const firstFiles = await (await fetch(`${baseUrl}/api/files`)).json()
      assert.ok(!firstFiles.some(file => file.cid === first.cid))

      const secondFiles = await (
        await fetchAs(SECOND_IDENTITY, `${baseUrl}/api/files`)
      ).json()
      assert.ok(secondFiles.some(file => file.cid === second.cid))
    })

    it('blocks remote invite users from node administration', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 8,
        configStore,
        nodeLogger,
        remoteInvites: ['invite-ok'],
      })

      const res = await app.request('/api/node/config', {
        headers: { 'x-mostbox-invite': 'invite-ok' },
      })
      const data = await res.json()
      assert.strictEqual(res.status, 403)
      assert.strictEqual(data.code, 'REMOTE_ADMIN_FORBIDDEN')
    })

    it('requires a configured invite when the node is opened remotely', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 9,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
        remoteInvites: [],
      })

      const res = await app.request('/api/node-id', {
        headers: { host: '203.0.113.10:1976' },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 403)
      assert.strictEqual(data.code, 'INVALID_INVITE')
    })

    it('does not trust LAN host headers by themselves', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 15,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
        remoteInvites: [],
      })

      const res = await app.request('/api/node-id', {
        headers: { host: '192.168.31.171:1976' },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 403)
      assert.strictEqual(data.code, 'INVALID_INVITE')
    })

    it('allows LAN administration when listening on all interfaces', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 16,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
      })

      const res = await app.request('/api/node/config', {
        headers: { host: '192.168.31.171:1976' },
      }, {
        incoming: { socket: { remoteAddress: '::ffff:192.168.31.239' } },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.currentHost, '0.0.0.0')
    })

    it('does not trust spoofed LAN host headers', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 17,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
        remoteInvites: [],
        trustPrivateNetwork: true,
      })

      const res = await app.request('/api/node-id', {
        headers: { host: '192.168.31.171:1976' },
      }, {
        incoming: { socket: { remoteAddress: '203.0.113.20' } },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 403)
      assert.strictEqual(data.code, 'INVALID_INVITE')
    })

    it('allows remote use with a valid invite when opened remotely', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 10,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
        remoteInvites: ['invite-ok'],
      })

      const res = await app.request('/api/node-id', {
        headers: {
          host: '203.0.113.10:1976',
          'x-mostbox-invite': 'invite-ok',
        },
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.ok(data.id)
    })

    it('keeps local administration available when opened remotely', async () => {
      const { app } = createApp(engine, {
        port: TEST_PORT + 11,
        host: '0.0.0.0',
        configStore,
        nodeLogger,
        remoteInvites: [],
      })

      const res = await app.request('/api/node/config', {
        headers: { host: 'localhost:1976' },
      })

      assert.strictEqual(res.status, 200)
    })
  })

  describe('404 handling', () => {
    it('returns 404 for unknown API endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/unknown`)
      assert.strictEqual(res.status, 404)
    })
  })

  describe('GET /api/display-name', () => {
    it('returns null displayName initially', async () => {
      const res = await fetch(`${baseUrl}/api/display-name`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.displayName, null)
    })
  })

  describe('POST /api/display-name', () => {
    it('sets display name', async () => {
      const res = await fetch(`${baseUrl}/api/display-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TestUser' }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.displayName, 'TestUser')
    })
  })

  describe('POST /api/channels', () => {
    it('requires login before creating a channel', async () => {
      const res = await fetchWithoutAuth(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `auth-${uid}` }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('creates a channel', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-channel' }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.name, 'test-channel')
      assert.ok(data.key)
      assert.strictEqual(data.channelKey, 'test-channel')
      assert.ok(!data.channelKey.includes(':'))
    })

    it('creates shared game room channels', async () => {
      for (const gameId of ['gandengyan', 'zhajinhua']) {
        const name = gameRoomCodeToChannelName(gameId, 'ABC123')
        const res = await fetch(`${baseUrl}/api/channels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: GAME_CHANNEL_TYPE }),
        })
        const data = await res.json()

        assert.strictEqual(res.status, 200)
        assert.ok(data.success)
        assert.strictEqual(data.name, name)
        assert.ok(data.key)
      }
    })

    it('returns existing channel if already created', async () => {
      await engine.createChannel(`dup-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `dup-${uid}` }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.name, `dup-${uid}`)
    })

    it('returns 400 for missing name', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert.strictEqual(res.status, 400)
    })

    it('returns 400 for invalid channel name', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ab' }),
      })
      assert.strictEqual(res.status, 400)
    })

    it('rejects dotted user-created channel IDs', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'user.sync.test' }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 400)
      assert.match(data.error, /点号为系统保留/)
    })
  })

  describe('GET /api/channels', () => {
    it('requires login before listing channels', async () => {
      const res = await fetchWithoutAuth(`${baseUrl}/api/channels`)
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('returns empty array initially', async () => {
      const res = await fetch(`${baseUrl}/api/channels`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })

    it('returns created channels', async () => {
      await engine.createChannel(`list-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.length >= 1)
      assert.ok(data.some(c => c.name === `list-${uid}`))
    })

    it('filters dotted system channels by default while preserving type queries', async () => {
      await engine.createChannel(`chat-${uid}`, 'public')
      await engine.createChannel(`game.zhajinhua.${uid}`, 'game')

      const gameRes = await fetch(`${baseUrl}/api/channels?type=game`)
      const gameData = await gameRes.json()
      assert.strictEqual(gameRes.status, 200)
      assert.ok(gameData.some(c => c.name === `game.zhajinhua.${uid}`))
      assert.ok(!gameData.some(c => c.name === `chat-${uid}`))

      const chatRes = await fetch(`${baseUrl}/api/channels`)
      const chatData = await chatRes.json()
      assert.strictEqual(chatRes.status, 200)
      assert.ok(chatData.some(c => c.name === `chat-${uid}`))
      assert.ok(!chatData.some(c => c.name === `game.zhajinhua.${uid}`))
      assert.ok(chatData.every(c => !String(c.name || '').includes('.')))
    })
  })

  describe('POST /api/channels/:name/messages', () => {
    it('requires login before sending a message', async () => {
      await engine.createChannel(`auth-msg-${uid}`)
      const res = await fetchWithoutAuth(
        `${baseUrl}/api/channels/auth-msg-${uid}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'Hello!',
            author: TEST_IDENTITY.address,
            authorName: 'TestUser',
          }),
        }
      )
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('sends a message to a channel', async () => {
      await engine.createChannel(`msg-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels/msg-${uid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Hello!',
          author: TEST_IDENTITY.address,
          authorName: 'TestUser',
        }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.message.content, 'Hello!')
    })

    it('updates channel member avatar when sending a message', async () => {
      const channelName = `member-avatar-${uid}`
      await engine.createChannel(channelName)
      const res = await fetch(`${baseUrl}/api/channels/${channelName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'avatar update',
          author: TEST_IDENTITY.address,
          authorName: 'AvatarUser',
          avatar: 'data:image/png;base64,avatar',
        }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.message.avatar, 'data:image/png;base64,avatar')

      const membersRes = await fetch(
        `${baseUrl}/api/channels/${channelName}/members`
      )
      const members = await membersRes.json()
      const messagesRes = await fetch(
        `${baseUrl}/api/channels/${channelName}/messages`
      )
      const messages = await messagesRes.json()

      assert.strictEqual(membersRes.status, 200)
      assert.strictEqual(members.length, 1)
      assert.strictEqual(members[0].displayName, 'AvatarUser')
      assert.strictEqual(members[0].avatar, 'data:image/png;base64,avatar')
      assert.strictEqual(messagesRes.status, 200)
      assert.strictEqual(messages[0].avatar, 'data:image/png;base64,avatar')

      const noAvatarRes = await fetch(
        `${baseUrl}/api/channels/${channelName}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'avatar unchanged',
            author: TEST_IDENTITY.address,
            authorName: 'AvatarUser',
          }),
        }
      )
      assert.strictEqual(noAvatarRes.status, 200)
      const unchangedMembersRes = await fetch(
        `${baseUrl}/api/channels/${channelName}/members`
      )
      const unchangedMembers = await unchangedMembersRes.json()
      assert.strictEqual(
        unchangedMembers[0].avatar,
        'data:image/png;base64,avatar'
      )
    })

    it('sends an attachment message to a channel', async () => {
      const channelName = `attach-${uid}`
      const fileName = `chat-file/${channelName}/clip.mp4`
      const link = `most://${VALID_MISSING_CID}?filename=${encodeURIComponent(fileName)}`
      await engine.createChannel(channelName)

      const res = await fetch(`${baseUrl}/api/channels/${channelName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: link,
          author: TEST_IDENTITY.address,
          authorName: 'TestUser',
          attachment: {
            kind: 'video',
            cid: VALID_MISSING_CID,
            fileName,
            link,
            mimeType: 'video/mp4',
            size: 456,
          },
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.message.content, link)
      assert.deepStrictEqual(data.message.attachment, {
        kind: 'video',
        cid: VALID_MISSING_CID,
        fileName,
        link,
        mimeType: 'video/mp4',
        size: 456,
      })
    })

    it('rejects invalid attachment metadata', async () => {
      const channelName = `badat-${uid}`
      await engine.createChannel(channelName)

      const res = await fetch(`${baseUrl}/api/channels/${channelName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `most://${VALID_MISSING_CID}?filename=chat-file%2Fbad%2Ffile.txt`,
          author: TEST_IDENTITY.address,
          authorName: 'TestUser',
          attachment: {
            kind: 'unknown',
            cid: VALID_MISSING_CID,
            fileName: 'chat-file/bad/file.txt',
            link: `most://${VALID_MISSING_CID}?filename=chat-file%2Fbad%2Ffile.txt`,
          },
        }),
      })
      const data = await res.json()

      assert.strictEqual(res.status, 400)
      assert.match(data.error, /attachment kind/)
    })

    it('rejects a message author that does not match the logged-in user', async () => {
      await engine.createChannel(`spoof-${uid}`)
      const res = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels/spoof-${uid}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'spoofed',
            author: TEST_IDENTITY.address,
            authorName: 'TestUser',
          }),
        }
      )
      const data = await res.json()

      assert.strictEqual(res.status, 403)
      assert.match(data.error, /author/)
    })

    it('blocks non-members from sending to a local channel', async () => {
      const channelName = `private-send-${uid}`
      await engine.createChannel(channelName)

      const blocked = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels/${channelName}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'not joined yet',
            author: SECOND_IDENTITY.address,
            authorName: 'SecondUser',
          }),
        }
      )
      const blockedData = await blocked.json()

      assert.strictEqual(blocked.status, 403)
      assert.strictEqual(blockedData.code, 'PERMISSION_ERROR')

      const joinRes = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: channelName }),
        }
      )
      assert.strictEqual(joinRes.status, 200)

      const allowed = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels/${channelName}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'joined now',
            author: SECOND_IDENTITY.address,
            authorName: 'SecondUser',
          }),
        }
      )
      const allowedData = await allowed.json()

      assert.strictEqual(allowed.status, 200)
      assert.strictEqual(allowedData.message.content, 'joined now')
    })

    it('returns 400 for empty content', async () => {
      await engine.createChannel(`empty-msg-${uid}`)
      const res = await fetch(
        `${baseUrl}/api/channels/empty-msg-${uid}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '' }),
        }
      )
      assert.strictEqual(res.status, 400)
    })
  })

  describe('GET /api/channels/:name/messages', () => {
    it('requires login before reading messages', async () => {
      await engine.createChannel(`auth-read-${uid}`)
      const res = await fetchWithoutAuth(
        `${baseUrl}/api/channels/auth-read-${uid}/messages`
      )
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('returns messages from a channel', async () => {
      await engine.createChannel(`read-${uid}`)
      await engine.sendMessage(
        `read-${uid}`,
        'msg1',
        '0x1234567890abcdef1234567890abcdef12345678',
        'TestUser'
      )
      await engine.sendMessage(
        `read-${uid}`,
        'msg2',
        '0x1234567890abcdef1234567890abcdef12345678',
        'TestUser'
      )

      const res = await fetch(`${baseUrl}/api/channels/read-${uid}/messages`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 2)
      assert.strictEqual(data[0].content, 'msg1')
      assert.strictEqual(data[1].content, 'msg2')
    })

    it('blocks non-members from reading local channel history', async () => {
      const channelName = `private-read-${uid}`
      await engine.createChannel(channelName)
      await engine.sendMessage(
        channelName,
        'owner-only message',
        TEST_IDENTITY.address,
        'TestUser'
      )

      const res = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels/${channelName}/messages`
      )
      const data = await res.json()

      assert.strictEqual(res.status, 403)
      assert.strictEqual(data.code, 'PERMISSION_ERROR')
    })

    it('returns empty array for channel with no messages', async () => {
      await engine.createChannel(`empty-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels/empty-${uid}/messages`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })

    it('supports pagination with limit and offset', async () => {
      await engine.createChannel(`page-${uid}`)
      for (let i = 0; i < 5; i++) {
        await engine.sendMessage(
          `page-${uid}`,
          `msg${i}`,
          '0x1234567890abcdef1234567890abcdef12345678',
          'TestUser'
        )
      }

      const res = await fetch(
        `${baseUrl}/api/channels/page-${uid}/messages?limit=2&offset=0`
      )
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.length, 2)
    })
  })

  describe('GET /api/channels/:name/members', () => {
    it('returns channel members ordered by join time', async () => {
      const channelName = `members-${uid}`
      const firstJoin = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: channelName,
          type: 'public',
          displayName: 'FirstUser',
          avatar: 'first.png',
        }),
      })
      assert.strictEqual(firstJoin.status, 200)

      await new Promise(resolve => setTimeout(resolve, 5))
      const secondJoin = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: channelName,
            type: 'public',
            displayName: 'SecondUser',
            avatar: 'second.png',
          }),
        }
      )
      assert.strictEqual(secondJoin.status, 200)

      const res = await fetch(`${baseUrl}/api/channels/${channelName}/members`)
      const data = await res.json()

      assert.strictEqual(res.status, 200)
      assert.deepStrictEqual(
        data.map(member => member.address),
        [TEST_IDENTITY.address.toLowerCase(), SECOND_IDENTITY.address.toLowerCase()]
      )
      assert.strictEqual(data[0].displayName, 'FirstUser')
      assert.strictEqual(data[0].avatar, 'first.png')
      assert.strictEqual(data[1].displayName, 'SecondUser')
      assert.strictEqual(data[1].avatar, 'second.png')
      assert.ok(new Date(data[0].joinedAt).getTime() > 0)
      assert.ok(
        new Date(data[0].joinedAt).getTime() <=
          new Date(data[1].joinedAt).getTime()
      )
    })

    it('blocks non-members from reading channel members', async () => {
      const channelName = `private-members-${uid}`
      await engine.createChannel(channelName)

      const res = await fetchAs(
        SECOND_IDENTITY,
        `${baseUrl}/api/channels/${channelName}/members`
      )
      const data = await res.json()

      assert.strictEqual(res.status, 403)
      assert.strictEqual(data.code, 'PERMISSION_ERROR')
    })
  })

  describe('GET /api/channels/:name/peers', () => {
    it('returns empty peers list for new channel', async () => {
      await engine.createChannel(`peers-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels/peers-${uid}/peers`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })
  })

  describe('DELETE /api/channels', () => {
    it('leaves a channel by JSON body name', async () => {
      await engine.createChannel(`leave-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'DELETE',
        body: JSON.stringify({ name: `leave-${uid}` }),
        headers: { 'content-type': 'application/json' },
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(!data.channels.some(c => c.name === `leave-${uid}`))
    })

    it('leaves a channel by JSON body channelKey', async () => {
      const channel = await engine.createChannel(`leave-body-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'DELETE',
        body: JSON.stringify({ channelKey: channel.channelKey }),
        headers: { 'content-type': 'application/json' },
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.ok(!data.channels.some(c => c.channelKey === channel.channelKey))
    })

    it('returns 400 for non-existent channel', async () => {
      const res = await fetch(`${baseUrl}/api/channels`, {
        method: 'DELETE',
        body: JSON.stringify({ channelKey: 'nonexistent' }),
        headers: { 'content-type': 'application/json' },
      })
      assert.strictEqual(res.status, 400)
    })

    it('does not expose path parameter channel deletion', async () => {
      const res = await fetch(`${baseUrl}/api/channels/nonexistent`, {
        method: 'DELETE',
      })
      assert.strictEqual(res.status, 404)
    })
  })

  describe('PUT /api/channels/:name/remark', () => {
    it('requires login before setting a remark', async () => {
      await engine.createChannel(`auth-remark-${uid}`)
      const res = await fetchWithoutAuth(
        `${baseUrl}/api/channels/auth-remark-${uid}/remark`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remark: '测试备注' }),
        }
      )
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('sets a remark for a channel', async () => {
      await engine.createChannel(`remark-${uid}`)
      const res = await fetch(`${baseUrl}/api/channels/remark-${uid}/remark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark: '测试备注' }),
      })
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok(data.success)
      assert.strictEqual(data.remark, '测试备注')
    })

    it('clears remark with empty string', async () => {
      await engine.createChannel(`remark-clr-${uid}`)
      await fetch(`${baseUrl}/api/channels/remark-clr-${uid}/remark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark: '有备注' }),
      })
      const res = await fetch(
        `${baseUrl}/api/channels/remark-clr-${uid}/remark`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remark: '' }),
        }
      )
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.strictEqual(data.remark, '')
    })

    it('returns 400 for non-existent channel', async () => {
      const res = await fetch(`${baseUrl}/api/channels/nonexistent/remark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark: 'test' }),
      })
      assert.strictEqual(res.status, 400)
    })

    it('returns 400 for remark exceeding max length', async () => {
      await engine.createChannel(`remark-long-${uid}`)
      const res = await fetch(
        `${baseUrl}/api/channels/remark-long-${uid}/remark`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remark: 'a'.repeat(51) }),
        }
      )
      assert.strictEqual(res.status, 400)
    })
  })

  describe('PUT /api/channels/:name/pin', () => {
    it('requires login before pinning a channel', async () => {
      await engine.createChannel(`auth-pin-${uid}`)
      const res = await fetchWithoutAuth(
        `${baseUrl}/api/channels/auth-pin-${uid}/pin`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: true }),
        }
      )
      const data = await res.json()

      assert.strictEqual(res.status, 401)
      assert.strictEqual(data.code, 'LOGIN_REQUIRED')
    })

    it('sets and clears a channel pin', async () => {
      await engine.createChannel(`pin-${uid}`, 'personal', {
        ownerAddress: TEST_IDENTITY.address,
      })
      const pinRes = await fetch(`${baseUrl}/api/channels/pin-${uid}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: true }),
      })
      const pinData = await pinRes.json()

      assert.strictEqual(pinRes.status, 200)
      assert.strictEqual(pinData.pinned, true)

      const listRes = await fetch(`${baseUrl}/api/channels`)
      const channels = await listRes.json()
      assert.strictEqual(
        channels.find(c => c.name === `pin-${uid}`).pinned,
        true
      )

      const clearRes = await fetch(`${baseUrl}/api/channels/pin-${uid}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: false }),
      })
      const clearData = await clearRes.json()
      assert.strictEqual(clearRes.status, 200)
      assert.strictEqual(clearData.pinned, false)
    })
  })

  describe('GET /api/config', () => {
    it('returns config with dataPath', async () => {
      const res = await fetch(`${baseUrl}/api/config`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok('dataPath' in data)
    })
  })

  describe('GET /api/network-status', () => {
    it('returns network status', async () => {
      const res = await fetch(`${baseUrl}/api/network-status`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok('peers' in data)
      assert.ok('status' in data)
    })
  })

  describe('GET /api/network', () => {
    it('returns network addresses', async () => {
      const res = await fetch(`${baseUrl}/api/network`)
      const data = await res.json()
      assert.strictEqual(res.status, 200)
      assert.ok('port' in data)
      assert.ok(Array.isArray(data.addresses))
      assert.ok(data.addresses.some(a => a.type === 'local'))
    })
  })

  describe('POST /api/shutdown', () => {
    it('allows localhost connection', async () => {
      const res = await fetch(`${baseUrl}/api/shutdown`, {
        method: 'POST',
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('POST /api/config', () => {
    it('sets dataPath successfully', async () => {
      const testPath = path.join(
        os.tmpdir(),
        `mostbox-config-test-${Date.now()}`
      )
      fs.mkdirSync(testPath, { recursive: true })

      const res = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPath: testPath }),
      })
      const data = await res.json()
      assert.strictEqual(data.success, true)
      assert.ok(data.dataPath.includes(testPath))

      fs.rmSync(testPath, { recursive: true, force: true })
    })

    it('rejects invalid path', async () => {
      const res = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPath: '/nonexistent/path/xyz123' }),
      })
      assert.strictEqual(res.status, 400)
    })

    it('resetStorage clears dataPath', async () => {
      const res = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetStorage: true }),
      })
      const data = await res.json()
      assert.strictEqual(data.success, true)
    })
  })

  describe('GET /api/config/data-path', () => {
    it('returns dataPath with isDefault flag', async () => {
      const res = await fetch(`${baseUrl}/api/config/data-path`)
      const data = await res.json()
      assert.ok('dataPath' in data)
      assert.ok('isDefault' in data)
      assert.strictEqual(typeof data.isDefault, 'boolean')
    })
  })
})
