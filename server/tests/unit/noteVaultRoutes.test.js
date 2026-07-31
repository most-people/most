import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../src/http/app.js'
import { createNodeConfigStore } from '../../src/node/config.js'
import { buildAuthHeaders } from '../../src/utils/auth.js'
import { createLoginIdentity } from '../../src/utils/userIdentity.js'

const TEST_IDENTITY = createLoginIdentity('vault-user', 'vault-password')
const LOCAL_REQUEST_CONTEXT = {
  incoming: { socket: { remoteAddress: '::ffff:127.0.0.1' } },
}

function createFakeEngine() {
  return {}
}

async function requestWithAuth(app, requestPath, init = {}) {
  const headers = new Headers(init.headers || {})
  if (!headers.has('host')) headers.set('host', 'localhost:1976')
  const method = init.method || 'GET'
  const authHeaders = await buildAuthHeaders(
    TEST_IDENTITY,
    method,
    new URL(requestPath, 'http://localhost').pathname
  )
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value)
  }
  return app.request(requestPath, { ...init, headers }, LOCAL_REQUEST_CONTEXT)
}

describe('note vault routes', () => {
  let tmpDir
  let configStore
  let app
  let originalElectronApp

  beforeEach(() => {
    originalElectronApp = process.env.ELECTRON_APP
    process.env.ELECTRON_APP = 'true'
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-note-vault-api-'))
    configStore = createNodeConfigStore(path.join(tmpDir, 'config'))
    app = createApp(createFakeEngine(), {
      configStore,
      port: 1976,
      host: '127.0.0.1',
    }).app
  })

  afterEach(() => {
    if (originalElectronApp === undefined) {
      delete process.env.ELECTRON_APP
    } else {
      process.env.ELECTRON_APP = originalElectronApp
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('requires login for note vault APIs', async () => {
    const res = await app.request(
      '/api/note-vault/status',
      { headers: { host: 'localhost:1976' } },
      LOCAL_REQUEST_CONTEXT
    )
    const data = await res.json()

    assert.strictEqual(res.status, 401)
    assert.strictEqual(data.code, 'LOGIN_REQUIRED')
  })

  it('rejects note vault APIs outside Electron mode', async () => {
    delete process.env.ELECTRON_APP

    const res = await requestWithAuth(app, '/api/note-vault/status')
    const data = await res.json()

    assert.strictEqual(res.status, 403)
    assert.strictEqual(data.code, 'PERMISSION_ERROR')
  })

  it('configures, lists, reads, and saves Markdown files', async () => {
    const vaultDir = path.join(tmpDir, 'vault')
    fs.mkdirSync(path.join(vaultDir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(vaultDir, 'docs', 'hello.md'), '# Hello', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'ignore.txt'), 'ignore', 'utf8')

    const configRes = await requestWithAuth(app, '/api/note-vault/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: vaultDir }),
    })
    const configData = await configRes.json()

    assert.strictEqual(configRes.status, 200)
    assert.strictEqual(configData.success, true)
    assert.strictEqual(configData.configured, true)
    assert.strictEqual(configData.fileCount, 1)

    const listRes = await requestWithAuth(app, '/api/note-vault/files')
    const listData = await listRes.json()

    assert.strictEqual(listRes.status, 200)
    assert.deepStrictEqual(
      listData.files.map(file => file.path),
      ['docs/hello.md']
    )

    const readRes = await requestWithAuth(
      app,
      '/api/note-vault/file?path=docs%2Fhello.md'
    )
    const readData = await readRes.json()

    assert.strictEqual(readRes.status, 200)
    assert.strictEqual(readData.content, '# Hello')

    const saveRes = await requestWithAuth(app, '/api/note-vault/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'docs/hello.md', content: '# Saved' }),
    })
    const saveData = await saveRes.json()

    assert.strictEqual(saveRes.status, 200)
    assert.strictEqual(saveData.success, true)
    assert.strictEqual(saveData.file.content, '# Saved')
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'docs', 'hello.md'), 'utf8'),
      '# Saved'
    )

    const createRes = await requestWithAuth(app, '/api/note-vault/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'docs/new.md', content: '# New' }),
    })
    const createData = await createRes.json()

    assert.strictEqual(createRes.status, 200)
    assert.strictEqual(createData.success, true)
    assert.strictEqual(createData.file.path, 'docs/new.md')

    const moveRes = await requestWithAuth(app, '/api/note-vault/file', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'docs/new.md',
        newPath: 'archive/new.md',
      }),
    })
    const moveData = await moveRes.json()

    assert.strictEqual(moveRes.status, 200)
    assert.strictEqual(moveData.success, true)
    assert.strictEqual(moveData.file.path, 'archive/new.md')
    assert.strictEqual(
      fs.existsSync(path.join(vaultDir, 'docs', 'new.md')),
      false
    )

    const snapshotRes = await requestWithAuth(app, '/api/note-vault/snapshot')
    const snapshotData = await snapshotRes.json()

    assert.strictEqual(snapshotRes.status, 200)
    assert.deepStrictEqual(
      snapshotData.files.map(file => file.path),
      ['archive/new.md', 'docs/hello.md']
    )

    const restoreRes = await requestWithAuth(app, '/api/note-vault/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ path: 'restored.md', content: '# Restored' }],
      }),
    })
    const restoreData = await restoreRes.json()

    assert.strictEqual(restoreRes.status, 200)
    assert.strictEqual(restoreData.success, true)
    assert.strictEqual(restoreData.result.created, 1)
    assert.strictEqual(restoreData.result.deleted, 2)
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'restored.md'), 'utf8'),
      '# Restored'
    )
    assert.strictEqual(
      fs.existsSync(path.join(vaultDir, 'docs', 'hello.md')),
      false
    )

    const deleteRes = await requestWithAuth(
      app,
      '/api/note-vault/file?path=restored.md',
      { method: 'DELETE' }
    )
    const deleteData = await deleteRes.json()

    assert.strictEqual(deleteRes.status, 200)
    assert.strictEqual(deleteData.success, true)
    assert.strictEqual(deleteData.deleted, true)
    assert.strictEqual(fs.existsSync(path.join(vaultDir, 'restored.md')), false)
  })
})
