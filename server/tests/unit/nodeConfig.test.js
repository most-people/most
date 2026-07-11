import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  createNodeConfigStore,
  normalizeNodeConfig,
} from '../../src/node/config.js'
import { MAX_FILE_SIZE } from '../../src/config.js'

describe('normalizeNodeConfig', () => {
  it('reads node config from the node bucket', () => {
    const config = normalizeNodeConfig({
      dataPath: ' C:/most-data ',
      node: {
        host: '0.0.0.0',
        capacityBytes: 123,
        maxFileSizeBytes: 45,
        remoteInvites: ['one', 'one', 'two'],
        adminAddress: '0x1111111111111111111111111111111111111111',
      },
    })

    assert.strictEqual(config.dataPath, 'C:/most-data')
    assert.strictEqual(config.host, '0.0.0.0')
    assert.strictEqual(config.port, DEFAULT_NODE_PORT)
    assert.strictEqual(config.capacityBytes, 123)
    assert.strictEqual(config.maxFileSizeBytes, 45)
    assert.deepStrictEqual(config.remoteInvites, ['one', 'two'])
    assert.strictEqual(
      config.adminAddress,
      '0x1111111111111111111111111111111111111111'
    )
  })

  it('ignores removed top-level node fields', () => {
    const config = normalizeNodeConfig({
      host: '0.0.0.0',
      capacityBytes: 123,
      maxFileSizeBytes: 45,
      remoteInvites: ['old'],
    })

    assert.strictEqual(config.host, DEFAULT_NODE_HOST)
    assert.strictEqual(config.capacityBytes, 100 * 1024 * 1024 * 1024)
    assert.strictEqual(config.maxFileSizeBytes, MAX_FILE_SIZE)
    assert.deepStrictEqual(config.remoteInvites, [])
    assert.strictEqual(config.adminAddress, '')
  })

  it('claims one administrator and preserves it across config patches', () => {
    const configDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'most-node-admin-config-')
    )
    try {
      const store = createNodeConfigStore(configDir)
      const first = store.claimAdminAddress(
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      )
      assert.strictEqual(first.success, true)
      assert.strictEqual(first.claimed, true)
      assert.strictEqual(
        first.adminAddress,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )

      store.saveNodeConfigPatch({ maxFileSizeBytes: 123 })
      assert.strictEqual(store.getNodeConfig().adminAddress, first.adminAddress)

      const second = store.claimAdminAddress(
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      )
      assert.strictEqual(second.success, true)
      assert.strictEqual(second.claimed, false)
      assert.strictEqual(second.adminAddress, first.adminAddress)
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })
})
