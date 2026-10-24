import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import createTestnet from 'hyperdht/testnet.js'
import { MostBoxEngine } from '../../src/index.js'
import { deriveAccountSyncKeys } from '../../src/utils/accountSync.js'

const ADDRESS = `0x${'cd'.repeat(20)}`
const { syncKey } = deriveAccountSyncKeys(`0x${'33'.repeat(32)}`)

async function waitFor(check, description, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.fail(`Timed out waiting for ${description}`)
}

describe('account sync over a real Hyperswarm network', () => {
  it('finds the same account on another node through the account topic', async t => {
    const testnet = await createTestnet(3)
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-acct-net-'))
    const engines = []
    t.after(async () => {
      for (const engine of engines) await engine.stop().catch(() => {})
      await testnet.destroy()
      fs.rmSync(directory, { recursive: true, force: true })
    })

    const start = async name => {
      const engine = new MostBoxEngine({
        dataPath: path.join(directory, name),
        bootstrap: testnet.bootstrap,
      })
      engines.push(engine)
      await engine.start()
      await engine.registerAccountSync(ADDRESS, syncKey)
      return engine
    }
    const first = await start('first')
    const second = await start('second')

    await first.createChannel('net-room', 'group', {
      ownerAddress: ADDRESS,
      displayName: 'Alice',
    })
    await waitFor(
      () =>
        second
          .listChannels({ ownerAddress: ADDRESS })
          .some(channel => channel.channelId === 'net-room'),
      'the channel to reach the second node over the DHT'
    )
    assert.equal(second.getAccountSyncStatus(ADDRESS).writerCores, 2)
  })

  it('keeps accounts with different sync keys apart on the same network', async t => {
    const testnet = await createTestnet(3)
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-acct-net-'))
    const engines = []
    t.after(async () => {
      for (const engine of engines) await engine.stop().catch(() => {})
      await testnet.destroy()
      fs.rmSync(directory, { recursive: true, force: true })
    })
    const otherKey = deriveAccountSyncKeys(`0x${'44'.repeat(32)}`).syncKey
    const start = async (name, key) => {
      const engine = new MostBoxEngine({
        dataPath: path.join(directory, name),
        bootstrap: testnet.bootstrap,
      })
      engines.push(engine)
      await engine.start()
      await engine.registerAccountSync(ADDRESS, key)
      return engine
    }
    const mine = await start('mine', syncKey)
    const other = await start('other', otherKey)
    await mine.createChannel('private-net-room', 'group', {
      ownerAddress: ADDRESS,
      displayName: 'Alice',
    })
    await new Promise(resolve => setTimeout(resolve, 4000))
    assert.deepEqual(other.listChannels({ ownerAddress: ADDRESS }), [])
    assert.equal(other.getAccountSyncStatus(ADDRESS).writerCores, 1)
  })
})
