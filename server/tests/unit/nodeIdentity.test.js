import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
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
    })
  })

  it('replaces a corrupt identity and keeps the replacement stable', () => {
    withTempDir(dataPath => {
      const identityPath = getNodeIdentityPath(dataPath)
      const first = loadOrCreateNodeSeed(dataPath)
      fs.writeFileSync(identityPath, '{corrupt', 'utf-8')

      const replacement = loadOrCreateNodeSeed(dataPath)
      const reloaded = loadOrCreateNodeSeed(dataPath)

      assert.notDeepStrictEqual(replacement, first)
      assert.deepStrictEqual(reloaded, replacement)
      assert.ok(!fs.existsSync(`${identityPath}.bak`))
    })
  })
})
