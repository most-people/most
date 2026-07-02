import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
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
      },
    })

    assert.strictEqual(config.dataPath, 'C:/most-data')
    assert.strictEqual(config.host, '0.0.0.0')
    assert.strictEqual(config.port, DEFAULT_NODE_PORT)
    assert.strictEqual(config.capacityBytes, 123)
    assert.strictEqual(config.maxFileSizeBytes, 45)
    assert.deepStrictEqual(config.remoteInvites, ['one', 'two'])
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
  })
})
