import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  ensureNodeSeedPersisted,
  getNodeIdentityPath,
  loadOrCreateNodeSeed,
} from '../../src/node/nodeIdentity.js'

function withTempDir(run) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'most-node-identity-')
  )
  try {
    return run(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

describe('node identity persistence', () => {
  it('creates and reloads the same seed', () => {
    withTempDir(dataPath => {
      const first = loadOrCreateNodeSeed(dataPath)
      const second = loadOrCreateNodeSeed(dataPath)

      assert.strictEqual(first.length, 32)
      assert.deepStrictEqual(second, first)
      assert.ok(fs.existsSync(getNodeIdentityPath(dataPath)))
      assert.ok(!fs.existsSync(`${getNodeIdentityPath(dataPath)}.bak`))
      assert.ok(
        fs.readdirSync(dataPath).every(fileName => !fileName.endsWith('.tmp'))
      )
      if (process.platform !== 'win32') {
        assert.strictEqual(
          fs.statSync(getNodeIdentityPath(dataPath)).mode & 0o777,
          0o600
        )
      }
    })
  })

  it('fails closed when an existing identity is corrupt', () => {
    withTempDir(dataPath => {
      const identityPath = getNodeIdentityPath(dataPath)
      loadOrCreateNodeSeed(dataPath)
      fs.writeFileSync(identityPath, '{corrupt', 'utf-8')

      assert.throws(
        () => loadOrCreateNodeSeed(dataPath),
        err =>
          err.code === 'PERSISTENCE_ERROR' &&
          err.details?.reason === 'NODE_IDENTITY_INVALID'
      )
      assert.strictEqual(fs.readFileSync(identityPath, 'utf-8'), '{corrupt')
    })
  })

  it('restores the active identity when storage initialization removes its file', () => {
    withTempDir(dataPath => {
      const seed = loadOrCreateNodeSeed(dataPath)
      const identityPath = getNodeIdentityPath(dataPath)
      fs.unlinkSync(identityPath)

      const restoredSeed = ensureNodeSeedPersisted(dataPath, seed)

      assert.deepStrictEqual(restoredSeed, seed)
      assert.deepStrictEqual(loadOrCreateNodeSeed(dataPath), seed)
    })
  })
})
