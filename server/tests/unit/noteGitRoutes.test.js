import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../src/http/app.js'
import { createNodeConfigStore } from '../../src/node/config.js'
import { buildAuthHeaders } from '../../src/utils/auth.js'
import { createLoginIdentity } from '../../src/utils/userIdentity.js'

const TEST_IDENTITY = createLoginIdentity('git-user', 'git-password')
const OTHER_IDENTITY = createLoginIdentity('other-git-user', 'git-password')
const LOCAL_REQUEST_CONTEXT = {
  incoming: { socket: { remoteAddress: '::ffff:127.0.0.1' } },
}

function createFakeEngine() {
  return {}
}

async function requestWithAuth(
  app,
  requestPath,
  init = {},
  identity = TEST_IDENTITY
) {
  const headers = new Headers(init.headers || {})
  if (!headers.has('host')) headers.set('host', 'localhost:1976')
  const method = init.method || 'GET'
  const authHeaders = await buildAuthHeaders(
    identity,
    method,
    new URL(requestPath, 'http://localhost').pathname
  )
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value)
  }
  return app.request(requestPath, { ...init, headers }, LOCAL_REQUEST_CONTEXT)
}

describe('note Git routes', () => {
  let tmpDir
  let vaultRoot
  let vaultDir
  let app
  let originalElectronApp

  beforeEach(() => {
    originalElectronApp = process.env.ELECTRON_APP
    process.env.ELECTRON_APP = 'true'
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-note-git-api-'))
    vaultRoot = path.join(tmpDir, 'vaults')
    vaultDir = path.join(vaultRoot, TEST_IDENTITY.address.toLowerCase())
    fs.mkdirSync(vaultDir, { recursive: true })
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), '# Hello', 'utf8')
    const configStore = createNodeConfigStore(path.join(tmpDir, 'config'))
    app = createApp(createFakeEngine(), {
      configStore,
      noteVaultRoot: vaultRoot,
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

  it('initializes, commits, lists history, and restores through the local API', async () => {
    const beforeRes = await requestWithAuth(app, '/api/note-vault/git/status')
    assert.strictEqual(beforeRes.status, 200)
    assert.strictEqual((await beforeRes.json()).initialized, false)

    const initRes = await requestWithAuth(app, '/api/note-vault/git/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: { name: 'Git User', email: 'git@mostbox.local' },
      }),
    })
    const initData = await initRes.json()
    assert.strictEqual(initRes.status, 200)
    assert.strictEqual(initData.status.changes.length, 1)

    const commitRes = await requestWithAuth(app, '/api/note-vault/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Initial notes' }),
    })
    const commitData = await commitRes.json()
    assert.strictEqual(commitRes.status, 200)
    assert.match(commitData.oid, /^[a-f0-9]{40}$/)

    fs.writeFileSync(path.join(vaultDir, 'hello.md'), '# Changed', 'utf8')
    const diffRes = await requestWithAuth(
      app,
      '/api/note-vault/git/diff?path=hello.md'
    )
    const diffData = await diffRes.json()
    assert.strictEqual(diffRes.status, 200)
    assert.ok(diffData.parts.some(part => part.added))

    const historyRes = await requestWithAuth(app, '/api/note-vault/git/history')
    const historyData = await historyRes.json()
    assert.strictEqual(historyRes.status, 200)
    assert.strictEqual(historyData.commits[0].message, 'Initial notes')

    const restoreRes = await requestWithAuth(
      app,
      '/api/note-vault/git/restore',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'hello.md', oid: commitData.oid }),
      }
    )
    assert.strictEqual(restoreRes.status, 200)
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'hello.md'), 'utf8'),
      '# Hello'
    )
  })

  it('keeps Git endpoints behind login and Electron-local access', async () => {
    const unauthenticated = await app.request(
      '/api/note-vault/git/status',
      { headers: { host: 'localhost:1976' } },
      LOCAL_REQUEST_CONTEXT
    )
    assert.strictEqual(unauthenticated.status, 401)

    delete process.env.ELECTRON_APP
    const browserOnly = await requestWithAuth(app, '/api/note-vault/git/status')
    assert.strictEqual(browserOnly.status, 403)
  })

  it('keeps Git repositories and history isolated by user address', async () => {
    for (const [identity, authorName] of [
      [TEST_IDENTITY, 'Git User'],
      [OTHER_IDENTITY, 'Other Git User'],
    ]) {
      const userVault = path.join(vaultRoot, identity.address.toLowerCase())
      fs.mkdirSync(userVault, { recursive: true })
      fs.writeFileSync(path.join(userVault, 'same.md'), authorName, 'utf8')

      const initRes = await requestWithAuth(
        app,
        '/api/note-vault/git/init',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: {
              name: authorName,
              email: `${identity.address.slice(-4)}@mostbox.local`,
            },
          }),
        },
        identity
      )
      assert.strictEqual(initRes.status, 200)

      const commitRes = await requestWithAuth(
        app,
        '/api/note-vault/git/commit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `${authorName} notes` }),
        },
        identity
      )
      assert.strictEqual(commitRes.status, 200)
    }

    const firstHistory = await requestWithAuth(
      app,
      '/api/note-vault/git/history'
    ).then(response => response.json())
    const secondHistory = await requestWithAuth(
      app,
      '/api/note-vault/git/history',
      {},
      OTHER_IDENTITY
    ).then(response => response.json())

    assert.deepStrictEqual(
      firstHistory.commits.map(commit => commit.message),
      ['Git User notes']
    )
    assert.deepStrictEqual(
      secondHistory.commits.map(commit => commit.message),
      ['Other Git User notes']
    )
    assert.strictEqual(fs.existsSync(path.join(vaultDir, '.git')), true)
    assert.strictEqual(
      fs.existsSync(
        path.join(vaultRoot, OTHER_IDENTITY.address.toLowerCase(), '.git')
      ),
      true
    )
  })
})
