import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMcpClientStore } from '../../src/mcp/clientStore.js'

const OWNER = '0x1111111111111111111111111111111111111111'

describe('MCP client store', () => {
  it('stores only a token hash and resolves files inside allowed roots', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-mcp-store-'))
    try {
      const allowedRoot = path.join(tmpDir, 'allowed')
      const outsideRoot = path.join(tmpDir, 'outside')
      fs.mkdirSync(allowedRoot)
      fs.mkdirSync(outsideRoot)
      const allowedFile = path.join(allowedRoot, 'file.txt')
      const outsideFile = path.join(outsideRoot, 'private.txt')
      fs.writeFileSync(allowedFile, 'allowed')
      fs.writeFileSync(outsideFile, 'private')

      const store = createMcpClientStore(path.join(tmpDir, 'config'))
      const result = store.createClient({
        name: 'Codex',
        ownerAddress: OWNER,
        scopes: ['files:read', 'files:publish'],
        allowedRoots: [allowedRoot],
      })

      assert.match(result.token, /^mbx_mcp_/)
      assert.strictEqual(store.authenticate(result.token)?.id, result.client.id)
      assert.strictEqual(
        store.resolvePublishPath(result.client.id, allowedFile),
        fs.realpathSync(allowedFile)
      )
      assert.throws(
        () => store.resolvePublishPath(result.client.id, outsideFile),
        err => err.code === 'PATH_SECURITY_ERROR'
      )
      assert.throws(
        () => store.resolvePublishPath(result.client.id, allowedRoot),
        err => err.code === 'PATH_SECURITY_ERROR'
      )
      if (process.platform !== 'win32') {
        const escapedLink = path.join(allowedRoot, 'escaped-link.txt')
        fs.symlinkSync(outsideFile, escapedLink)
        assert.throws(
          () => store.resolvePublishPath(result.client.id, escapedLink),
          err => err.code === 'PATH_SECURITY_ERROR'
        )
      }

      const persisted = fs.readFileSync(store.storeFile, 'utf-8')
      assert.doesNotMatch(persisted, new RegExp(result.token))
      assert.match(persisted, /"tokenHash": "[a-f0-9]{64}"/)
      if (process.platform !== 'win32') {
        assert.strictEqual(fs.statSync(store.storeFile).mode & 0o777, 0o600)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('rejects expired and revoked clients', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-mcp-expiry-'))
    let currentTime = Date.parse('2026-07-31T00:00:00.000Z')
    try {
      const store = createMcpClientStore(path.join(tmpDir, 'config'), {
        now: () => currentTime,
      })
      const expiring = store.createClient({
        name: 'Short lived',
        ownerAddress: OWNER,
        scopes: ['node:read'],
        expiresInDays: 1,
      })
      assert.ok(store.authenticate(expiring.token))
      currentTime += 2 * 86_400_000
      assert.strictEqual(store.authenticate(expiring.token), null)
      assert.strictEqual(store.listClients()[0].active, false)

      const revoked = store.createClient({
        name: 'Revoked',
        ownerAddress: OWNER,
        scopes: ['node:read'],
      })
      assert.ok(store.revokeClient(revoked.client.id)?.revokedAt)
      assert.strictEqual(store.authenticate(revoked.token), null)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('requires an allowed directory for publish scope', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-mcp-roots-'))
    try {
      const store = createMcpClientStore(path.join(tmpDir, 'config'))
      assert.throws(
        () =>
          store.createClient({
            name: 'Publisher',
            ownerAddress: OWNER,
            scopes: ['files:publish'],
          }),
        err => err.code === 'PATH_SECURITY_ERROR'
      )
      assert.throws(
        () =>
          store.createClient({
            name: 'Missing root',
            ownerAddress: OWNER,
            scopes: ['files:publish'],
            allowedRoots: [path.join(tmpDir, 'missing')],
          }),
        err => err.code === 'PATH_SECURITY_ERROR'
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('fails closed when the credential store is malformed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-mcp-corrupt-'))
    try {
      const configDir = path.join(tmpDir, 'config')
      fs.mkdirSync(configDir)
      const storeFile = path.join(configDir, 'mcp-clients.json')
      const malformed = JSON.stringify({ version: 1, clients: [{}] })
      fs.writeFileSync(storeFile, malformed)

      const store = createMcpClientStore(configDir)
      assert.throws(() => store.listClients(), /Invalid MCP client record/)
      assert.throws(() =>
        store.createClient({
          name: 'Must not overwrite',
          ownerAddress: OWNER,
          scopes: ['node:read'],
        })
      )
      assert.strictEqual(fs.readFileSync(storeFile, 'utf-8'), malformed)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
