import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MostBoxEngine } from '../../src/index.js'
import { deriveAccountSyncKeys } from '../../src/utils/accountSync.js'

const ADDRESS = `0x${'ab'.repeat(20)}`
const { syncKey } = deriveAccountSyncKeys(`0x${'11'.repeat(32)}`)
const otherKey = deriveAccountSyncKeys(`0x${'22'.repeat(32)}`).syncKey

async function waitFor(check, description) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`Timed out waiting for ${description}`)
}

async function fixture(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-acct-sync-'))
  const engines = []
  const connections = []
  context.after(async () => {
    for (const connection of connections) connection.close()
    for (const engine of engines) await engine.stop()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return {
    async engine(name = String(engines.length)) {
      const engine = new MostBoxEngine({
        dataPath: path.join(directory, name),
        disableNetwork: true,
      })
      engines.push(engine)
      await engine.start()
      return engine
    },
    connect(first, second) {
      const connection = first.replicateWith(second)
      connections.push(connection)
      return connection
    },
  }
}

describe('engine account sync', () => {
  it('syncs account state between two engines of the same account', async t => {
    const fx = await fixture(t)
    const first = await fx.engine()
    const second = await fx.engine()
    await first.registerAccountSync(ADDRESS, syncKey)
    await second.registerAccountSync(ADDRESS, syncKey)
    fx.connect(first, second)

    await first.appendAccountSyncEntry(ADDRESS, {
      kind: 'channel',
      id: 'room',
      data: { pinned: true },
    })
    await waitFor(
      () =>
        second
          .listAccountSyncEntries(ADDRESS, { kind: 'channel' })
          .some(entry => entry.id === 'room'),
      'the channel entry to reach the second engine'
    )
    assert.notEqual(
      first.getAccountSyncStatus(ADDRESS).deviceId,
      second.getAccountSyncStatus(ADDRESS).deviceId
    )
  })

  it('ignores a device registered with a different sync key', async t => {
    const fx = await fixture(t)
    const first = await fx.engine()
    const stranger = await fx.engine()
    await first.registerAccountSync(ADDRESS, syncKey)
    await stranger.registerAccountSync(ADDRESS, otherKey)
    fx.connect(first, stranger)
    await stranger.appendAccountSyncEntry(ADDRESS, {
      kind: 'channel',
      id: 'evil',
      data: {},
    })
    await new Promise(resolve => setTimeout(resolve, 600))
    assert.deepEqual(first.listAccountSyncEntries(ADDRESS), [])
    assert.equal(first.getAccountSyncStatus(ADDRESS).writerCores, 1)
  })

  it('keeps registrations across an engine restart', async t => {
    const fx = await fixture(t)
    const engine = await fx.engine('restart')
    await engine.registerAccountSync(ADDRESS, syncKey)
    await engine.appendAccountSyncEntry(ADDRESS, {
      kind: 'profile',
      id: 'self',
      data: { displayName: 'A' },
    })
    await engine.stop()
    await engine.start()
    assert.equal(engine.getAccountSyncStatus(ADDRESS).registered, true)
    assert.deepEqual(
      engine.listAccountSyncEntries(ADDRESS).map(entry => entry.data),
      [{ displayName: 'A' }]
    )
  })

  it('does not leak the sync key through the channel list or status', async t => {
    const fx = await fixture(t)
    const engine = await fx.engine()
    await engine.registerAccountSync(ADDRESS, syncKey)
    assert.equal(
      JSON.stringify(engine.getAccountSyncStatus(ADDRESS)).includes(syncKey),
      false
    )
  })
})

describe('engine account state sync', () => {
  async function pair(t) {
    const fx = await fixture(t)
    const first = await fx.engine()
    const second = await fx.engine()
    await first.registerAccountSync(ADDRESS, syncKey)
    await second.registerAccountSync(ADDRESS, syncKey)
    fx.connect(first, second)
    return { first, second }
  }

  const channelOf = (engine, channelId) =>
    engine
      .listChannels({ ownerAddress: ADDRESS })
      .find(channel => channel.channelId === channelId)

  it('propagates joining, remarks, pins and leaving a channel', async t => {
    const { first, second } = await pair(t)
    const created = await first.createChannel('sync-room', 'group', {
      ownerAddress: ADDRESS,
      displayName: 'Alice',
    })
    await waitFor(
      () => channelOf(second, 'sync-room'),
      'the channel to appear on the second device'
    )

    first.setChannelPinned(created.channelKey, true, { ownerAddress: ADDRESS })
    first.setChannelRemark(created.channelKey, 'work', {
      ownerAddress: ADDRESS,
    })
    await waitFor(
      () =>
        channelOf(second, 'sync-room')?.pinned === true &&
        channelOf(second, 'sync-room')?.remark === 'work',
      'pin and remark to sync'
    )

    await second.leaveChannel(created.channelKey, { ownerAddress: ADDRESS })
    await waitFor(
      () => !channelOf(first, 'sync-room'),
      'the first device to follow the leave'
    )
  })

  it('propagates the profile and file metadata but not file content', async t => {
    const { first, second } = await pair(t)
    first.saveUserProfile(ADDRESS, { displayName: 'Alice Renamed' })
    const published = await first.publishFile(
      Buffer.from('sync me by cid'),
      'synced.txt',
      { ownerAddress: ADDRESS }
    )
    await waitFor(
      () => second.getUserProfile(ADDRESS)?.displayName === 'Alice Renamed',
      'the profile to sync'
    )
    await waitFor(
      () =>
        second
          .listPublishedFiles({ ownerAddress: ADDRESS })
          .some(file => file.cid === published.cid),
      'the file record to sync'
    )
    const record = second
      .listPublishedFiles({ ownerAddress: ADDRESS })
      .find(file => file.cid === published.cid)
    assert.equal(record.fileName, 'synced.txt')
    assert.equal(record.localAvailable, false)
    assert.ok(!second.listHoldings().some(item => item.cid === published.cid))
  })

  it('settles instead of echoing changes back and forth', async t => {
    const { first, second } = await pair(t)
    const created = await first.createChannel('quiet-room', 'group', {
      ownerAddress: ADDRESS,
      displayName: 'Alice',
    })
    await waitFor(() => channelOf(second, 'quiet-room'), 'the channel to sync')
    first.setChannelPinned(created.channelKey, true, { ownerAddress: ADDRESS })
    await waitFor(
      () => channelOf(second, 'quiet-room')?.pinned === true,
      'the pin to sync'
    )
    await new Promise(resolve => setTimeout(resolve, 1500))
    const newest = engine =>
      Math.max(
        0,
        ...engine.listAccountSyncEntries(ADDRESS).map(e => e.updatedAt)
      )
    const before = [newest(first), newest(second)]
    await new Promise(resolve => setTimeout(resolve, 1500))
    assert.deepEqual([newest(first), newest(second)], before)
    assert.equal(newest(first), newest(second))
  })

  it('does not republish everything after a restart', async t => {
    const fx = await fixture(t)
    const engine = await fx.engine('republish')
    await engine.registerAccountSync(ADDRESS, syncKey)
    await engine.createChannel('stay-room', 'group', {
      ownerAddress: ADDRESS,
      displayName: 'Alice',
    })
    await waitFor(
      () => engine.listAccountSyncEntries(ADDRESS, { kind: 'channel' }).length,
      'the channel entry to be published'
    )
    const before = engine.listAccountSyncEntries(ADDRESS).map(e => e.updatedAt)
    await engine.stop()
    await engine.start()
    await new Promise(resolve => setTimeout(resolve, 1200))
    assert.deepEqual(
      engine.listAccountSyncEntries(ADDRESS).map(e => e.updatedAt),
      before
    )
  })
})
