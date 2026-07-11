import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  createNodeConfigStore,
  normalizeNodeConfig,
} from '../../src/node/config.js'
import { MAX_FILE_SIZE } from '../../src/config.js'

const CONFIG_CLAIM_WORKER = fileURLToPath(
  new URL('../fixtures/configClaimWorker.js', import.meta.url)
)

function waitForWorkerMessage(child, expectedType, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for worker message: ${expectedType}`))
    }, timeoutMs)
    const onMessage = message => {
      if (message?.type !== expectedType) return
      clearTimeout(timer)
      child.off('error', onError)
      child.off('message', onMessage)
      resolve(message)
    }
    const onError = err => {
      clearTimeout(timer)
      child.off('message', onMessage)
      reject(err)
    }
    child.on('message', onMessage)
    child.once('error', onError)
  })
}

function createClaimWorker(configDir, address) {
  return fork(CONFIG_CLAIM_WORKER, [configDir, address], {
    silent: true,
  })
}

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

  it('times out on an active lock without overwriting the current config', () => {
    const configDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'most-node-config-lock-')
    )
    const store = createNodeConfigStore(configDir, {
      lockTimeoutMs: 20,
      lockRetryMs: 5,
      lockStaleMs: 60_000,
    })
    try {
      assert.strictEqual(
        store.saveNodeConfigPatch({ capacityBytes: 111 }).success,
        true
      )
      fs.writeFileSync(store.lockFile, 'another-process', 'utf8')

      const originalError = console.error
      console.error = () => {}
      let result
      try {
        result = store.saveNodeConfigPatch({ capacityBytes: 222 })
      } finally {
        console.error = originalError
      }

      assert.strictEqual(result.success, false)
      assert.strictEqual(result.reason, 'CONFIG_LOCK_TIMEOUT')
      assert.strictEqual(store.getNodeConfig().capacityBytes, 111)
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('recovers stale locks and preserves unknown config fields', () => {
    const configDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'most-node-config-stale-lock-')
    )
    const store = createNodeConfigStore(configDir, {
      lockStaleMs: 10,
      lockRetryMs: 1,
    })
    try {
      assert.strictEqual(
        store.saveRawConfig({
          futureTopLevel: { enabled: true },
          node: { futureNodeField: 'keep-me' },
        }),
        true
      )
      fs.writeFileSync(store.lockFile, 'crashed-process', 'utf8')
      const oldTime = new Date(Date.now() - 1_000)
      fs.utimesSync(store.lockFile, oldTime, oldTime)

      const result = store.saveNodeConfigPatch({ maxFileSizeBytes: 123 })
      const raw = JSON.parse(fs.readFileSync(store.configFile, 'utf8'))

      assert.strictEqual(result.success, true)
      assert.deepStrictEqual(raw.futureTopLevel, { enabled: true })
      assert.strictEqual(raw.node.futureNodeField, 'keep-me')
      assert.strictEqual(fs.existsSync(store.lockFile), false)
      assert.deepStrictEqual(
        fs.readdirSync(configDir).filter(name => name.endsWith('.tmp')),
        []
      )
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('does not overwrite malformed config with normalized defaults', () => {
    const configDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'most-node-config-malformed-')
    )
    const store = createNodeConfigStore(configDir)
    try {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(store.configFile, '{invalid json', 'utf8')

      const originalError = console.error
      console.error = () => {}
      let result
      try {
        result = store.saveNodeConfigPatch({ capacityBytes: 123 })
      } finally {
        console.error = originalError
      }

      assert.strictEqual(result.success, false)
      assert.strictEqual(
        fs.readFileSync(store.configFile, 'utf8'),
        '{invalid json'
      )
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('allows only one administrator claim across concurrent processes', async () => {
    const configDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'most-node-config-multiprocess-')
    )
    const addresses = Array.from(
      { length: 6 },
      (_, index) => `0x${String(index + 1).repeat(40)}`
    )
    const workers = addresses.map(address =>
      createClaimWorker(configDir, address)
    )

    try {
      await Promise.all(
        workers.map(worker => waitForWorkerMessage(worker, 'ready'))
      )
      const results = workers.map(worker =>
        waitForWorkerMessage(worker, 'result')
      )
      for (const worker of workers) worker.send({ type: 'start' })
      const messages = await Promise.all(results)
      const claims = messages.map(message => message.result)
      const winner = claims.find(result => result.claimed)

      assert.strictEqual(
        claims.every(result => result.success),
        true
      )
      assert.strictEqual(claims.filter(result => result.claimed).length, 1)
      assert.ok(winner)
      assert.strictEqual(
        createNodeConfigStore(configDir).getNodeConfig().adminAddress,
        winner.adminAddress
      )
      assert.strictEqual(fs.existsSync(`${configDir}/config.json.lock`), false)
    } finally {
      for (const worker of workers) {
        if (worker.connected) worker.disconnect()
        if (!worker.killed) worker.kill()
      }
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })
})
