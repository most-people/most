import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import { MobileP2PCore } from './mobile-core.mjs'

class RecordingSwarm extends EventEmitter {
  constructor(publicKeyByte) {
    super()
    this.connections = new Set()
    this.destroyed = false
    this.joins = []
    this.leaves = []
    this.keyPair = {
      publicKey: b4a.alloc(32, publicKeyByte),
    }
  }

  join(topic, options = {}) {
    const topicHex = b4a.toString(topic, 'hex')
    this.joins.push({
      topicHex,
      options: { ...options },
    })
    return {
      flushed: async () => {},
    }
  }

  async leave(topic) {
    this.leaves.push(b4a.toString(topic, 'hex'))
  }

  async destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

function createRecordingSwarmFactory(swarms) {
  return () => {
    const swarm = new RecordingSwarm(swarms.length + 1)
    swarms.push(swarm)
    return swarm
  }
}

async function waitFor(condition, description, timeoutMs = 500) {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const value = condition()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

describe('mobile P2P Ping snapshot and RPC events', () => {
  it('starts, reports, resets, and destroys both direction swarms', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-p2p-ping-')
    )
    const swarms = []
    const events = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
      send: (type, payload) => events.push({ type, payload }),
    })

    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    assert.equal(swarms.length, 1)
    assert.equal(core.getSnapshot().p2pPing, null)

    const ping = await core.startP2PPing({ role: 'host' })
    assert.match(ping.code, /^\d{6}$/)
    await waitFor(
      () => core.getSnapshot().p2pPing?.status === 'waiting',
      'P2P Ping to start waiting'
    )
    assert.equal(swarms.length, 3)
    assert.deepEqual(swarms[1].joins[0].options, {
      server: false,
      client: true,
    })
    assert.deepEqual(swarms[2].joins[0].options, {
      server: true,
      client: false,
    })
    assert.equal(events.at(-1).type, 'p2p.ping.status')
    assert.equal(events.at(-1).payload.snapshot.p2pPing.id, ping.id)

    const cancelled = core.cancelP2PPing({ id: ping.id })
    assert.equal(cancelled, null)
    await waitFor(
      () => swarms[1].destroyed && swarms[2].destroyed,
      'temporary Ping swarm cleanup'
    )
    assert.equal(core.getSnapshot().p2pPing, null)

    const next = await core.startP2PPing({ role: 'host' })
    assert.notEqual(next.id, ping.id)
    assert.equal(swarms.length, 5)
  })
})

describe('mobile file downloads', () => {
  it('recreates the downloads directory before writing a temporary file', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-download-dir-')
    )
    const cores = []
    t.after(async () => {
      await Promise.allSettled(cores.map(core => core.stop()))
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const createCore = swarms => {
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory(swarms),
      })
      cores.push(core)
      return core
    }

    const content = 'download me after restart'
    const firstCore = createCore([])
    await firstCore.start()
    const published = await firstCore.publishFile({
      name: 'sample-photo.jpg',
      contentBase64: b4a.toString(b4a.from(content), 'base64'),
    })
    const link = published.transfer.link
    await firstCore.stop()
    await fs.rm(path.join(storagePath, 'node-holdings.json'), {
      force: true,
    })

    const restartedCore = createCore([])
    await restartedCore.start()
    await fs.rm(path.join(storagePath, 'downloads'), {
      recursive: true,
      force: true,
    })

    const result = await restartedCore.downloadLink({ link })
    assert.equal(result.transfer.status, 'completed')
    assert.equal(await fs.readFile(result.savedPath, 'utf8'), content)
  })

  it('does not treat holding metadata alone as local content', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-stale-holding-')
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    const originalEntry = Hyperdrive.prototype.entry

    t.after(async () => {
      Hyperdrive.prototype.entry = originalEntry
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const content = 'content behind stale holding metadata'
    const published = await core.publishFile({
      name: 'stale-holding.txt',
      contentBase64: b4a.toString(b4a.from(content), 'base64'),
    })

    let hideNextEntry = true
    Hyperdrive.prototype.entry = function (...args) {
      if (hideNextEntry) {
        hideNextEntry = false
        return Promise.resolve(null)
      }
      return originalEntry.apply(this, args)
    }

    const result = await core.downloadLink({ link: published.transfer.link })
    assert.equal(result.alreadyExists, undefined)
    assert.equal(result.transfer.status, 'completed')
    assert.equal(await fs.readFile(result.savedPath, 'utf8'), content)
  })

  it('fails peer discovery cleanly when no seed comes online', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-no-seed-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    await assert.rejects(
      core.downloadLink({
        link: `most://${cid}?filename=missing.txt`,
        timeout: 20,
      }),
      /No online seed was found/
    )

    const transfer = core.getSnapshot().transfers.find(item => item.cid === cid)
    assert.equal(transfer?.status, 'failed')
    assert.deepEqual(swarms[0].joins.at(-1).options, {
      server: true,
      client: true,
    })
    assert.equal(swarms[0].leaves.length, 1)
  })

  it('cancels active peer discovery and leaves the CID topic', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-cancel-download-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    const requestId = 'cancel-download-test'

    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const download = core.downloadLink(
      { link: `most://${cid}?filename=missing.txt`, timeout: 5000 },
      requestId
    )
    await waitFor(
      () =>
        core.getSnapshot().transfers.find(transfer => transfer.id === requestId)
          ?.status === 'running',
      'download to enter running state'
    )

    const cancelled = await core.cancelDownload({ cid })
    assert.equal(cancelled.cid, cid)
    await assert.rejects(download, /Download cancelled/)

    const transfer = core
      .getSnapshot()
      .transfers.find(item => item.id === requestId)
    assert.equal(transfer?.status, 'failed')
    assert.equal(transfer?.message, 'Download cancelled')
    assert.equal(swarms[0].leaves.length, 1)
  })
})

describe('mobile local holding deletion', () => {
  it('clears local Hyperdrive content without publishing a tombstone', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-delete-holding-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const originalDel = Hyperdrive.prototype.del
    const originalClear = Hyperdrive.prototype.clear
    let delCalls = 0
    let clearCalls = 0

    t.after(async () => {
      Hyperdrive.prototype.del = originalDel
      Hyperdrive.prototype.clear = originalClear
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const published = await core.publishFile({
      name: 'local-delete.txt',
      contentBase64: b4a.toString(b4a.from('local content'), 'base64'),
    })
    assert.deepEqual(swarms[0].joins.at(-1).options, {
      server: true,
      client: true,
    })

    Hyperdrive.prototype.del = async function (...args) {
      delCalls += 1
      return originalDel.apply(this, args)
    }
    Hyperdrive.prototype.clear = async function (...args) {
      clearCalls += 1
      return originalClear.apply(this, args)
    }

    await core.deleteHolding({ cid: published.transfer.cid })

    assert.equal(delCalls, 0)
    assert.equal(clearCalls, 1)
    assert.equal(core.getSnapshot().holdings.length, 0)
  })
})
