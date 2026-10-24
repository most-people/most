import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import { AccountSync } from '../../src/node/accountSync.js'
import { deriveAccountSyncKeys } from '../../src/utils/accountSync.js'

const SEED = '0x' + '11'.repeat(32)
const OTHER_SEED = '0x' + '22'.repeat(32)
const ADDRESS = '0x' + 'ab'.repeat(20)
const { syncKey } = deriveAccountSyncKeys(SEED)
const cleanups = []

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

async function createNode({ dir, now } = {}) {
  const root =
    dir || fs.mkdtempSync(path.join(os.tmpdir(), 'most-account-sync-'))
  // 与引擎一致：所有节点共用固定 primaryKey，所以 core 名字必须带每设备随机数。
  const store = new Corestore(root, {
    primaryKey: Buffer.alloc(32).fill('most-box-global-shared-seed-v1'),
    unsafe: true,
  })
  await store.ready()
  const sync = new AccountSync({ store, dataPath: root, now })
  if (!dir) {
    cleanups.push(async () => fs.rmSync(root, { recursive: true, force: true }))
  }
  cleanups.push(async () => {
    await sync.stop()
    await store.close()
  })
  return { root, store, sync }
}

/** 把两个节点连起来：core 复制走 store.replicate，hello 走内存里的聊天流。 */
function connect(a, b) {
  const left = a.store.replicate(true, { live: true })
  const right = b.store.replicate(false, { live: true })
  left.on('error', () => {})
  right.on('error', () => {})
  left.pipe(right).pipe(left)
  const streamFor = (from, to) => {
    const stream = new EventEmitter()
    stream.write = line => {
      void to.sync.handleMessage(null, JSON.parse(line))
      return true
    }
    from.sync.attachStream(stream)
    return stream
  }
  streamFor(a, b)
  streamFor(b, a)
  cleanups.push(async () => {
    left.destroy()
    right.destroy()
  })
}

async function waitFor(check, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = check()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('condition not met in time')
}

describe('AccountSync (single node)', () => {
  it('registers idempotently, rejects a conflicting key and validates input', async () => {
    const node = await createNode()
    const first = await node.sync.register(ADDRESS, syncKey)
    assert.equal(first.registered, true)
    assert.equal(first.topic, deriveAccountSyncKeys(SEED).topic)
    assert.deepEqual(await node.sync.register(ADDRESS, syncKey), first)
    await assert.rejects(
      node.sync.register(ADDRESS, deriveAccountSyncKeys(OTHER_SEED).syncKey),
      /different sync key/
    )
    await assert.rejects(node.sync.register('nope', syncKey), /address/)
    await assert.rejects(
      node.sync.register('0x' + 'cd'.repeat(20), 'zz'),
      /sync key/
    )
    assert.deepEqual(node.sync.status('0x' + '00'.repeat(20)), {
      registered: false,
    })
  })

  it('merges writes by last writer and keeps tombstones from resurrecting', async () => {
    const node = await createNode({ now: () => 1000 })
    await node.sync.register(ADDRESS, syncKey)
    await node.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'room',
      data: { pinned: false },
    })
    await node.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'room',
      data: { pinned: true },
    })
    await node.sync.append(ADDRESS, { kind: 'channel', id: 'gone', data: {} })
    await node.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'gone',
      deleted: true,
    })
    const entries = node.sync.list(ADDRESS, { kind: 'channel' })
    assert.deepEqual(
      entries.map(entry => [entry.id, entry.data]),
      [['room', { pinned: true }]]
    )
    assert.equal(node.sync.status(ADDRESS).entries, 1)
  })

  it('strictly increases updatedAt even when the clock does not advance', async () => {
    const node = await createNode({ now: () => 5000 })
    await node.sync.register(ADDRESS, syncKey)
    const a = await node.sync.append(ADDRESS, { kind: 'k', id: 'i', data: 1 })
    const b = await node.sync.append(ADDRESS, { kind: 'k', id: 'i', data: 2 })
    assert.ok(b.updatedAt > a.updatedAt)
    assert.equal(node.sync.list(ADDRESS)[0].data, 2)
  })

  it('restores registrations and state after a restart', async () => {
    const first = await createNode()
    await first.sync.register(ADDRESS, syncKey)
    await first.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'room',
      data: { n: 1 },
    })
    await first.sync.stop()
    await first.store.close()

    const second = await createNode({ dir: first.root })
    await second.sync.start()
    assert.equal(second.sync.status(ADDRESS).registered, true)
    assert.deepEqual(
      second.sync.list(ADDRESS).map(entry => entry.data),
      [{ n: 1 }]
    )
    assert.equal(
      fs
        .readFileSync(path.join(first.root, 'account-sync.json'), 'utf-8')
        .includes(syncKey),
      true
    )
  })

  it('emits change events with the winning entries', async () => {
    const node = await createNode()
    await node.sync.register(ADDRESS, syncKey)
    const events = []
    node.sync.on('change', event => events.push(event))
    await node.sync.append(ADDRESS, { kind: 'channel', id: 'room', data: {} })
    assert.equal(events.length, 1)
    assert.equal(events[0].address, ADDRESS)
    assert.equal(events[0].changed[0].id, 'room')
  })
})

describe('AccountSync (several devices)', () => {
  it('discovers each other through hello and converges in both directions', async () => {
    const a = await createNode()
    const b = await createNode()
    await a.sync.register(ADDRESS, syncKey)
    await b.sync.register(ADDRESS, syncKey)
    await a.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'from-a',
      data: { by: 'a' },
    })
    connect(a, b)

    await waitFor(() =>
      b.sync.list(ADDRESS).some(entry => entry.id === 'from-a')
    )
    await b.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'from-b',
      data: { by: 'b' },
    })
    await waitFor(() =>
      a.sync.list(ADDRESS).some(entry => entry.id === 'from-b')
    )

    await b.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'from-a',
      deleted: true,
    })
    await waitFor(
      () => !a.sync.list(ADDRESS).some(entry => entry.id === 'from-a')
    )
    const ids = list => list.map(entry => entry.id).sort()
    assert.deepEqual(ids(a.sync.list(ADDRESS)), ids(b.sync.list(ADDRESS)))
    assert.notEqual(
      a.sync.status(ADDRESS).deviceId,
      b.sync.status(ADDRESS).deviceId
    )
  })

  it('never opens or applies cores from a device with a different sync key', async () => {
    const a = await createNode()
    const stranger = await createNode()
    await a.sync.register(ADDRESS, syncKey)
    await stranger.sync.register(
      ADDRESS,
      deriveAccountSyncKeys(OTHER_SEED).syncKey
    )
    await stranger.sync.append(ADDRESS, {
      kind: 'channel',
      id: 'evil',
      data: {},
    })
    connect(a, stranger)
    await new Promise(resolve => setTimeout(resolve, 500))
    assert.equal(a.sync.status(ADDRESS).writerCores, 1)
    assert.deepEqual(a.sync.list(ADDRESS), [])
  })

  it('syncs three devices through a chain', async () => {
    const a = await createNode()
    const b = await createNode()
    const c = await createNode()
    for (const node of [a, b, c]) await node.sync.register(ADDRESS, syncKey)
    connect(a, b)
    connect(b, c)
    await a.sync.append(ADDRESS, { kind: 'channel', id: 'x', data: {} })
    await waitFor(() => c.sync.list(ADDRESS).some(entry => entry.id === 'x'))
    assert.equal(c.sync.status(ADDRESS).writerCores >= 2, true)
  })
})
