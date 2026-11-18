import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import Hyperdrive from 'hyperdrive'
import {
  CHANNEL_PROOF_VERSION,
  CHANNELS_FILE,
  normalizeChannelMessage,
  sortChannelMessages,
} from './channel-protocol.mjs'
import {
  channelTopics,
  channelWriterKeyPair,
  createChannelProof,
  resolveChannelHandle,
} from './channel-keys-v2.mjs'

// v2 topics derive from the channel key of a handle (channel-keys.md §3).
function generateChannelChatDiscoveryKey(handle) {
  return channelTopics(resolveChannelHandle(handle).key).chat
}

function generateChannelDiscoveryKey(handle) {
  return channelTopics(resolveChannelHandle(handle).key).replication
}
import { MobileP2PCore } from './mobile-core.mjs'
import { Wallet } from 'ethers'
import { buildSignedEntry } from './channel-signed-entry.mjs'
import {
  signMessage,
  signedInput,
  signPresence,
  signProfile,
  defaultWallet,
} from './signed-message.test-helper.mjs'

const remotePresenceWallet = Wallet.createRandom()

const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'

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
  return options => {
    const swarm = new RecordingSwarm(swarms.length + 1)
    swarm.createOptions = { ...options }
    swarms.push(swarm)
    return swarm
  }
}

class RecordingStream extends EventEmitter {
  constructor() {
    super()
    this.destroyed = false
    this.writableEnded = false
    this.writes = []
  }

  write(data) {
    this.writes.push(b4a.toString(data))
    return true
  }
}

function waitForTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
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

function parseStreamWrites(stream, type) {
  return stream.writes
    .join('')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(message => message.type === type)
}

function channelPeerInfo(channelId, publicKeyByte = 0x63) {
  const info = new EventEmitter()
  info.topics = [generateChannelChatDiscoveryKey(channelId)]
  info.publicKey = b4a.alloc(32, publicKeyByte)
  return info
}

async function proveChannelKnowledge({
  stream,
  peerInfo,
  chatSwarm,
  channelIds,
}) {
  const challenge = parseStreamWrites(stream, 'channel-proof-challenge').at(
    -1
  )?.challenge
  assert.match(challenge, /^[0-9a-f]{64}$/)

  const message = {
    type: 'channel-proof',
    version: CHANNEL_PROOF_VERSION,
    challenge,
    proofs: channelIds.map(channelId => {
      const topic = b4a.toString(
        generateChannelChatDiscoveryKey(channelId),
        'hex'
      )
      return {
        topic,
        proof: b4a.toString(
          createChannelProof({
            key: resolveChannelHandle(channelId).key,
            topic,
            challenge,
            proverPublicKey: peerInfo.publicKey,
            verifierPublicKey: chatSwarm.keyPair.publicKey,
          }),
          'hex'
        ),
      }
    }),
  }
  stream.emit('data', b4a.from(`${JSON.stringify(message)}\n`))
  await waitForTick()
  return message
}

function expectedChannelJoinTopics(channelId) {
  return [
    b4a.toString(generateChannelDiscoveryKey(channelId), 'hex'),
    b4a.toString(generateChannelChatDiscoveryKey(channelId), 'hex'),
  ]
}

function assertJoinedChannelTopics(swarms, channelId) {
  const joinedTopics = new Set(
    swarms.flatMap(swarm => swarm.joins.map(join => join.topicHex))
  )

  for (const topicHex of expectedChannelJoinTopics(channelId)) {
    assert.equal(
      joinedTopics.has(topicHex),
      true,
      `expected channel discovery topic ${topicHex} to be joined`
    )
  }

  for (const swarm of swarms) {
    for (const join of swarm.joins) {
      assert.deepEqual(join.options, { server: true, client: true })
    }
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('mobile CID announcement diagnostics', () => {
  for (const outcome of ['false', 'rejection']) {
    it(`logs an incomplete CID announcement on ${outcome} without losing the local copy`, async t => {
      const storagePath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mostbox-announce-')
      )
      const factory = createRecordingSwarmFactory([])
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: options => {
          const swarm = factory(options)
          const join = swarm.join.bind(swarm)
          swarm.join = (topic, joinOptions) => {
            const discovery = join(topic, joinOptions)
            discovery.flushed = async () => {
              if (outcome === 'rejection')
                throw new Error('DHT announcement unavailable')
              return false
            }
            return discovery
          }
          return swarm
        },
      })
      t.after(async () => {
        await core.stop()
        assert.ok(
          storagePath.startsWith(path.join(os.tmpdir(), 'mostbox-announce-'))
        )
        await fs.rm(storagePath, { recursive: true, force: true })
      })
      await core.start()
      const published = await core.publishFile({
        name: 'announcement.txt',
        contentBase64: b4a.toString(
          b4a.from('CID announcement diagnostic'),
          'base64'
        ),
      })
      await waitFor(
        () =>
          core
            .getSnapshot()
            .logs.some(
              entry =>
                entry.level === 'warn' &&
                entry.message.includes(
                  'CID topic announcement did not complete'
                ) &&
                entry.message.includes(published.holding.cid)
            ),
        'incomplete CID announcement warning'
      )
      assert.equal(core.getSnapshot().transfers[0].status, 'completed')
      assert.equal(core.getSnapshot().holdings[0].localAvailable, true)
      const exported = await core.exportHolding({ cid: published.holding.cid })
      assert.equal(
        await fs.readFile(exported.filePath, 'utf8'),
        'CID announcement diagnostic'
      )
    })
  }
})

describe('mobile durable transfer history', () => {
  it('persists a real publish and restores it in a new core instance', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-transfer-publish-')
    )
    const options = {
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    }
    const first = new MobileP2PCore(options)
    const second = new MobileP2PCore(options)
    t.after(async () => {
      await first.stop()
      await second.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await first.start()
    const published = await first.publishFile({
      name: 'history.txt',
      contentBase64: b4a.toString(b4a.from('durable task'), 'base64'),
    })
    await first.stop()
    await second.start()
    const restored = second
      .getSnapshot()
      .transfers.find(transfer => transfer.id === published.transfer.id)
    assert.equal(restored.status, 'completed')
    assert.equal(restored.cid, published.holding.cid)
    assert.equal(restored.progress, 100)
  })

  it('restores interrupted downloads as retryable failures without claiming completion', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-transfer-history-')
    )
    const transfersPath = path.join(storagePath, 'transfers.json')
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    await core.start()
    await core.stop()
    await fs.writeFile(
      transfersPath,
      JSON.stringify([
        {
          id: 'interrupted',
          kind: 'download',
          status: 'running',
          fileName: 'partial.bin',
          progress: 65,
          message: 'Downloading file',
        },
        {
          id: 'finished',
          kind: 'publish',
          status: 'completed',
          fileName: 'complete.bin',
          progress: 100,
          message: 'Published',
        },
        { id: 'invalid', kind: 'other', status: 'completed' },
      ])
    )
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    const transfers = core.getSnapshot().transfers
    assert.equal(transfers.length, 2)
    assert.equal(transfers[0].status, 'failed')
    assert.equal(transfers[0].progress, 0)
    assert.match(transfers[0].message, /interrupted/)
    assert.equal(transfers[1].status, 'completed')
    assert.equal(core.getSnapshot().holdings.length, 0)
    assert.deepEqual(
      JSON.parse(await fs.readFile(transfersPath, 'utf8')),
      JSON.parse(JSON.stringify(transfers))
    )
    await core.stop()
    await core.start()
    assert.deepEqual(core.getSnapshot().transfers, transfers)
  })

  it('starts safely with malformed history', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-transfer-malformed-')
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    await core.start()
    await core.stop()
    await fs.writeFile(path.join(storagePath, 'transfers.json'), '{broken')
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    assert.deepEqual(core.getSnapshot().transfers, [])
  })
})

describe('mobile P2P Ping snapshot and RPC events', () => {
  it('passes an opt-in relay public key to data, chat, and ping swarms', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-relay-config-')
    )
    const swarms = []
    const relayThrough = b4a.alloc(32, 0x7a)
    const core = new MobileP2PCore({
      storagePath,
      relayThrough,
      createSwarm: createRecordingSwarmFactory(swarms),
    })

    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    assert.equal(swarms.length, 2)
    assert.equal(swarms[0].createOptions.relayThrough, relayThrough)
    assert.equal(swarms[1].createOptions.relayThrough, relayThrough)

    await core.startP2PPing({ role: 'host' })
    await waitFor(() => swarms.length === 4, 'relay ping swarms to start')
    assert.equal(swarms[2].createOptions.relayThrough, relayThrough)
    assert.equal(swarms[3].createOptions.relayThrough, relayThrough)
  })

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
    assert.equal(swarms.length, 2)
    assert.equal(core.getSnapshot().p2pPing, null)

    const ping = await core.startP2PPing({ role: 'host' })
    assert.match(ping.code, /^\d{6}$/)
    await waitFor(
      () => core.getSnapshot().p2pPing?.status === 'waiting',
      'P2P Ping to start waiting'
    )
    assert.equal(swarms.length, 4)
    assert.deepEqual(swarms[2].joins[0].options, {
      server: false,
      client: true,
    })
    assert.deepEqual(swarms[3].joins[0].options, {
      server: true,
      client: false,
    })
    assert.equal(core.getP2PPing({ id: ping.id }).id, ping.id)
    assert.equal(events.at(-1).type, 'p2p.ping.status')
    assert.equal(events.at(-1).payload.snapshot.p2pPing.id, ping.id)

    const cancelled = core.cancelP2PPing({ id: ping.id })
    assert.equal(cancelled, null)
    await waitFor(
      () => swarms[2].destroyed && swarms[3].destroyed,
      'temporary Ping swarm cleanup'
    )
    assert.equal(core.getSnapshot().p2pPing, null)

    const next = await core.startP2PPing({ role: 'host' })
    assert.notEqual(next.id, ping.id)
    assert.equal(swarms.length, 6)
  })
})

describe('mobile file downloads', () => {
  it('preserves partial bytes after a stream failure and verifies a retry', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-stream-retry-')
    )
    const options = {
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    }
    const first = new MobileP2PCore(options)
    const restarted = new MobileP2PCore(options)
    const originalReadStream = Hyperdrive.prototype.createReadStream
    t.after(async () => {
      Hyperdrive.prototype.createReadStream = originalReadStream
      await first.stop()
      await restarted.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await first.start()
    const content = 'network interrupted after a verified cached prefix'
    const published = await first.publishFile({
      name: 'retry.txt',
      contentBase64: b4a.toString(b4a.from(content), 'base64'),
    })
    await first.stop()
    await fs.rm(path.join(storagePath, 'node-holdings.json'))
    await restarted.start()
    Hyperdrive.prototype.createReadStream = () =>
      Readable.from(
        (async function* () {
          yield b4a.from(content.slice(0, 10))
          await new Promise(resolve => setTimeout(resolve, 50))
          throw new Error('Injected connection lost')
        })()
      )
    await assert.rejects(
      restarted.downloadLink({ link: published.transfer.link }),
      /connection lost/
    )
    const tempPath = path.join(
      storagePath,
      'downloads',
      `${published.holding.cid}.part`
    )
    assert.equal(await fs.readFile(tempPath, 'utf8'), content.slice(0, 10))
    assert.equal(restarted.getSnapshot().holdings.length, 0)
    Hyperdrive.prototype.createReadStream = originalReadStream
    const result = await restarted.downloadLink({
      link: published.transfer.link,
    })
    assert.equal(await fs.readFile(result.savedPath, 'utf8'), content)
    assert.equal(result.transfer.status, 'completed')
    assert.equal(result.holding.cid, published.holding.cid)
  })

  it('cancels during CID verification without saving or recording a holding', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-verify-cancel-')
    )
    const first = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    let cancelAtVerification = false
    let cancellation
    const restarted = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
      send: (_type, payload) => {
        if (
          cancelAtVerification &&
          payload?.transfers?.some(
            transfer =>
              transfer.phase === 'verifying' && transfer.progress >= 90
          )
        ) {
          cancelAtVerification = false
          cancellation = restarted.cancelDownload({ cid })
        }
      },
    })
    let cid
    t.after(async () => {
      await first.stop()
      await restarted.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await first.start()
    const published = await first.publishFile({
      name: 'cancel.txt',
      contentBase64: b4a.toString(
        b4a.from('cancel during verification'),
        'base64'
      ),
    })
    cid = published.holding.cid
    await first.stop()
    await fs.rm(path.join(storagePath, 'node-holdings.json'))
    await restarted.start()
    cancelAtVerification = true
    await assert.rejects(
      restarted.downloadLink({ link: published.transfer.link }),
      /Download cancelled/
    )
    await cancellation
    assert.equal(cancelAtVerification, false)
    assert.equal(restarted.getSnapshot().holdings.length, 0)
    await assert.rejects(
      fs.stat(path.join(storagePath, 'downloads', `${cid}.part`)),
      { code: 'ENOENT' }
    )
    const result = await restarted.downloadLink({
      link: published.transfer.link,
    })
    assert.equal(result.transfer.status, 'completed')
  })

  for (const cache of ['partial', 'complete', 'oversized', 'corrupt']) {
    it(`handles ${cache} persisted bytes with complete CID verification`, async t => {
      const storagePath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mostbox-resume-')
      )
      const options = {
        storagePath,
        createSwarm: createRecordingSwarmFactory([]),
      }
      const first = new MobileP2PCore(options)
      const restarted = new MobileP2PCore(options)
      const originalReadStream = Hyperdrive.prototype.createReadStream
      t.after(async () => {
        Hyperdrive.prototype.createReadStream = originalReadStream
        await first.stop()
        await restarted.stop()
        await fs.rm(storagePath, { recursive: true, force: true })
      })
      await first.start()
      const content = 'persistent cached prefix and remaining CID content'
      const published = await first.publishFile({
        name: 'resume.txt',
        contentBase64: b4a.toString(b4a.from(content), 'base64'),
      })
      await first.stop()
      await fs.rm(path.join(storagePath, 'node-holdings.json'))
      const tempPath = path.join(
        storagePath,
        'downloads',
        `${published.holding.cid}.part`
      )
      await fs.mkdir(path.dirname(tempPath), { recursive: true })
      const cachedContent =
        cache === 'corrupt'
          ? 'XXXXXXXXXX'
          : cache === 'complete'
            ? content
            : cache === 'oversized'
              ? content + 'extra'
              : content.slice(0, 10)
      await fs.writeFile(tempPath, cachedContent)
      await restarted.start()
      let offset
      Hyperdrive.prototype.createReadStream = function (name, opts) {
        offset = opts?.start
        return originalReadStream.call(this, name, opts)
      }
      if (cache === 'corrupt') {
        // The corrupt cache fails verification, is discarded, and the same
        // source is read again from byte 0.
        const repaired = await restarted.downloadLink({
          link: published.transfer.link,
        })
        assert.equal(await fs.readFile(repaired.savedPath, 'utf8'), content)
        assert.equal(offset, 0)
        await assert.rejects(fs.stat(tempPath), { code: 'ENOENT' })
      } else {
        const result = await restarted.downloadLink({
          link: published.transfer.link,
        })
        assert.equal(
          offset,
          cache === 'complete' ? content.length : cache === 'oversized' ? 0 : 10
        )
        assert.equal(await fs.readFile(result.savedPath, 'utf8'), content)
        assert.equal(result.holding.cid, published.holding.cid)
        assert.equal(result.holding.localAvailable, true)
        assert.equal(result.transfer.phase, 'completed')
        assert.equal(result.transfer.completedBytes, content.length)
        assert.equal(result.transfer.totalBytes, content.length)
        const persisted = JSON.parse(
          await fs.readFile(path.join(storagePath, 'transfers.json'), 'utf8')
        ).find(item => item.id === result.transfer.id)
        assert.equal(persisted.phase, 'completed')
        assert.equal(persisted.completedBytes, content.length)
      }
    })
  }

  it('exports CID content when the cached file path contains different bytes', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-export-cid-')
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    const filePath = path.join(storagePath, 'source.txt')
    await fs.writeFile(filePath, 'original CID content')
    const published = await core.publishFile({ filePath, name: 'source.txt' })
    await fs.writeFile(filePath, 'different bytes at the same path')
    const exported = await core.exportHolding({ cid: published.holding.cid })
    assert.equal(
      await fs.readFile(exported.filePath, 'utf8'),
      'original CID content'
    )
    assert.equal(
      await fs.readFile(filePath, 'utf8'),
      'different bytes at the same path'
    )
    assert.notEqual(exported.filePath, filePath)
  })

  it('rejects missing blobs after restart and repairs them on republication', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-missing-blobs-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    const input = {
      name: 'missing-content.txt',
      contentBase64: b4a.toString(
        b4a.from('real local blob content'),
        'base64'
      ),
    }
    await core.start()
    const published = await core.publishFile(input)
    const cid = published.holding.cid
    await core.stop()

    const [holding] = JSON.parse(
      await fs.readFile(path.join(storagePath, 'node-holdings.json'), 'utf8')
    )
    const store = new Corestore(storagePath, {
      primaryKey: b4a.alloc(32).fill('most-box-global-shared-seed-v1'),
      unsafe: true,
    })
    const drive = new Hyperdrive(store.namespace(holding.driveName))
    try {
      await drive.ready()
      assert.equal(await drive.has(`/${cid}`), true)
      await drive.clear(`/${cid}`)
      assert.ok(await drive.entry(`/${cid}`))
      assert.equal(await drive.has(`/${cid}`), false)
    } finally {
      await drive.close()
      await store.close()
    }

    await core.start()
    await waitFor(
      () => core.getSnapshot().holdings[0]?.status === 'error',
      'missing local content to require attention'
    )
    const unavailable = core.getSnapshot().holdings[0]
    assert.equal(unavailable.localAvailable, false)
    assert.equal(unavailable.topicJoined, false)
    assert.equal(swarms[2].joins.length, 0)
    await assert.rejects(
      core.exportHolding({ cid }),
      /not available for export/
    )
    await assert.rejects(
      core.downloadLink({ link: published.transfer.link, timeout: 1000 }),
      /No online seed was found/
    )
    assert.equal(core.getSnapshot().transfers[0].status, 'failed')
    assert.equal(core.getSnapshot().holdings[0].status, 'error')
    assert.equal(core.getSnapshot().holdings[0].topicJoined, false)

    const repaired = await core.publishFile(input)
    assert.equal(repaired.holding.cid, cid)
    assert.equal(repaired.holding.localAvailable, true)
    assert.equal(repaired.holding.status, 'active')
    const available = await core.downloadLink({ link: published.transfer.link })
    assert.equal(available.alreadyExists, true)
    assert.equal(available.transfer.status, 'completed')
  })

  it('recognizes complete zero-byte files after restart', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-empty-file-')
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    const filePath = path.join(storagePath, 'empty.txt')
    await core.start()
    await fs.writeFile(filePath, '')
    const published = await core.publishFile({ filePath, name: 'empty.txt' })
    assert.equal(published.holding.localAvailable, true)
    assert.equal(published.holding.size, 0)
    await core.stop()
    await core.start()
    const result = await core.downloadLink({ link: published.transfer.link })
    assert.equal(result.alreadyExists, true)
    assert.equal(result.holding.localAvailable, true)
    assert.equal(result.holding.status, 'active')
  })

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
      name: 'chat-photo.jpg',
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
    const tempPath = path.join(storagePath, 'downloads', `${cid}.part`)
    await fs.mkdir(path.dirname(tempPath), { recursive: true })
    await fs.writeFile(tempPath, 'previous interrupted bytes')
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

    await assert.rejects(
      core.downloadLink({ link: `most://${cid}?filename=renamed.txt` }),
      /already running/
    )
    const cancelled = await core.cancelDownload({ cid })
    assert.equal(cancelled.cid, cid)
    await assert.rejects(download, /Download cancelled/)
    await assert.rejects(fs.stat(tempPath), { code: 'ENOENT' })

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

describe('mobile channel core restart recovery', () => {
  it('restores persisted channels, rejoins topics, keeps writer cores, and continues messaging', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-core-')
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
    const channelId = 'android-restart'

    const firstSwarms = []
    const firstCore = createCore(firstSwarms)
    await firstCore.start()
    const created = await firstCore.createChannel({
      name: channelId,
      discover: false,
    })
    assertJoinedChannelTopics(firstSwarms, channelId)

    const writerCoreKey = created.localWriterCoreKey
    assert.match(writerCoreKey, /^[0-9a-f]{64}$/)
    assert.deepEqual(created.writerCoreKeys, [writerCoreKey])

    const at = Date.now()
    const profile = fields => signProfile(created.channelKey, fields)
    const writeProfile = async fields =>
      firstCore.updateChannelMemberProfile({
        channelName: channelId,
        signed: await profile(fields),
      })
    const before = firstCore.listChannels()[0].lastMessageAt
    await writeProfile({
      displayName: 'Alice',
      avatar: 'avatar',
      tag: { default: 'Member' },
      createdAt: at,
    })
    await writeProfile({ avatar: '', tag: null, createdAt: at + 1 })
    await writeProfile({ displayName: 'Old', createdAt: at - 1 })
    const expected = [
      {
        address: defaultWallet.address.toLowerCase(),
        displayName: 'Alice',
        avatar: '',
        profileUpdatedAt: at + 1,
      },
    ]
    assert.deepEqual(
      await firstCore.getChannelMemberProfiles({ channelName: channelId }),
      expected
    )
    assert.deepEqual(
      await firstCore.getChannelMessages({ channelName: channelId }),
      []
    )
    assert.equal(firstCore.listChannels()[0].lastMessageAt, before)
    await assert.rejects(
      writeProfile({ displayName: ' padded ' }),
      /invalid displayName/
    )
    await assert.rejects(
      writeProfile({ createdAt: at + 600000 }),
      /too far ahead/
    )

    await firstCore.sendChannelMessage(
      await signedInput(firstCore, {
        channelName: channelId,
        authorName: 'Android',
        content: 'before restart',
      })
    )
    assert.deepEqual(
      (await firstCore.getChannelMessages({ channelName: channelId })).map(
        message => message.content
      ),
      ['before restart']
    )

    const persistedChannels = JSON.parse(
      await fs.readFile(path.join(storagePath, CHANNELS_FILE), 'utf8')
    )
    assert.equal(persistedChannels.length, 1)
    assert.equal(persistedChannels[0].channelId, channelId)
    assert.equal(persistedChannels[0].localWriterCoreKey, writerCoreKey)
    assert.deepEqual(persistedChannels[0].writerCoreKeys, [writerCoreKey])

    await firstCore.stop()

    const restartedSwarms = []
    const restartedCore = createCore(restartedSwarms)
    await restartedCore.start()
    assertJoinedChannelTopics(restartedSwarms, channelId)

    const [restoredChannel] = restartedCore.listChannels()
    assert.deepEqual(
      await restartedCore.getChannelMemberProfiles({ channelName: channelId }),
      expected
    )
    assert.equal(restoredChannel.channelId, channelId)
    assert.equal(restoredChannel.localWriterCoreKey, writerCoreKey)
    assert.deepEqual(restoredChannel.writerCoreKeys, [writerCoreKey])
    assert.deepEqual(
      (await restartedCore.getChannelMessages({ channelName: channelId })).map(
        message => message.content
      ),
      ['before restart']
    )

    await restartedCore.sendChannelMessage(
      await signedInput(restartedCore, {
        channelName: channelId,
        authorName: 'Android',
        content: 'after restart',
      })
    )
    assert.deepEqual(
      (await restartedCore.getChannelMessages({ channelName: channelId })).map(
        message => message.content
      ),
      ['before restart', 'after restart']
    )
  })
})

describe('mobile channel presence', () => {
  it('joins, heartbeats, leaves, and broadcasts Android presence', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-presence-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-presence',
      discover: false,
    })

    const chatSwarm = swarms[1]
    const stream = new RecordingStream()
    const peerInfo = channelPeerInfo(channel.channelId)
    chatSwarm.emit('connection', stream, peerInfo)
    await proveChannelKnowledge({
      stream,
      peerInfo,
      chatSwarm,
      channelIds: [channel.channelId],
    })

    const joined = core.joinChannelPresence({
      channelName: channel.channelKey,
      signed: await signPresence(channel.channelKey, 'online', {
        sessionId: 'android-test',
        displayName: 'Android',
      }),
    })
    assert.equal(joined.length, 1)
    assert.equal(joined[0].address, defaultWallet.address.toLowerCase())
    assert.equal(joined[0].displayName, 'Android')
    assert.equal(joined[0].online, true)
    assert.equal(joined[0].local, true)

    core.heartbeatChannelPresence({
      channelName: channel.channelKey,
      signed: await signPresence(channel.channelKey, 'heartbeat', {
        sessionId: 'android-test',
      }),
    })
    core.leaveChannelPresence({
      channelName: channel.channelKey,
      signed: await signPresence(channel.channelKey, 'offline', {
        sessionId: 'android-test',
      }),
    })

    const presenceWrites = parseStreamWrites(stream, 'channel-presence')
    assert.deepEqual(
      presenceWrites.map(message => message.body.status),
      ['online', 'heartbeat', 'offline']
    )
    assert.equal(
      core.getSnapshot().channelPresence[channel.channelKey]?.length || 0,
      0
    )
  })

  it('tracks remote presence, clears it on disconnect, and expires stale sessions', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-presence-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
      channelPresenceTimeoutMs: 100,
      channelPresenceSweepMs: 10,
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-presence-remote',
      discover: false,
    })

    const chatSwarm = swarms[1]
    const stream = new RecordingStream()
    const peerInfo = channelPeerInfo(channel.channelId)
    chatSwarm.emit('connection', stream, peerInfo)
    await proveChannelKnowledge({
      stream,
      peerInfo,
      chatSwarm,
      channelIds: [channel.channelId],
    })
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({ v: 2, type: 'channel-presence', ...(await signPresence(channel.channelKey, 'online', { wallet: remotePresenceWallet, sessionId: 'web', displayName: 'Desktop' })) })}\n`
      )
    )

    let presences = await waitFor(
      () =>
        core.getSnapshot().channelPresence[channel.channelKey]?.length === 1
          ? core.getSnapshot().channelPresence[channel.channelKey]
          : null,
      'remote channel presence'
    )
    assert.equal(presences.length, 1)
    assert.equal(presences[0].displayName, 'Desktop')
    assert.equal(presences[0].online, true)
    assert.equal(presences[0].local, false)

    stream.emit('close')
    await waitFor(
      () =>
        (core.getSnapshot().channelPresence[channel.channelKey]?.length ||
          0) === 0,
      'remote channel presence disconnect'
    )

    const staleStream = new RecordingStream()
    const stalePeerInfo = channelPeerInfo(channel.channelId, 0x64)
    chatSwarm.emit('connection', staleStream, stalePeerInfo)
    await proveChannelKnowledge({
      stream: staleStream,
      peerInfo: stalePeerInfo,
      chatSwarm,
      channelIds: [channel.channelId],
    })
    staleStream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({ v: 2, type: 'channel-presence', ...(await signPresence(channel.channelKey, 'online', { wallet: remotePresenceWallet, sessionId: 'web', displayName: 'Stale' })) })}\n`
      )
    )
    presences = await waitFor(
      () =>
        core.getSnapshot().channelPresence[channel.channelKey]?.length === 1
          ? core.getSnapshot().channelPresence[channel.channelKey]
          : null,
      'stale remote channel presence'
    )
    assert.equal(presences.length, 1)

    await waitFor(
      () =>
        (core.getSnapshot().channelPresence[channel.channelKey]?.length ||
          0) === 0,
      'stale remote channel presence expiry',
      500
    )
  })
})

describe('mobile channel connection scoping', () => {
  it('does not exchange unrelated channel metadata or presence', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-channel-scope-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const sharedChannel = await core.createChannel({
      name: 'android-shared',
      discover: false,
    })
    const privateChannel = await core.createChannel({
      name: 'android-private',
      discover: false,
    })

    const stream = new RecordingStream()
    const peerInfo = channelPeerInfo(sharedChannel.channelId)
    const chatSwarm = swarms[1]
    chatSwarm.emit('connection', stream, peerInfo)

    assert.equal(parseStreamWrites(stream, 'channel-hello').length, 0)

    const privateTopic = b4a.toString(
      generateChannelChatDiscoveryKey(privateChannel.channelId),
      'hex'
    )
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-scope',
          topics: [privateTopic],
        })}\n`
      )
    )
    const challenge = parseStreamWrites(stream, 'channel-proof-challenge').at(
      -1
    ).challenge
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-proof',
          version: CHANNEL_PROOF_VERSION,
          challenge,
          proofs: [{ topic: privateTopic, proof: '0'.repeat(64) }],
        })}\n`
      )
    )
    await waitForTick()
    assert.equal(parseStreamWrites(stream, 'channel-hello').length, 0)

    await proveChannelKnowledge({
      stream,
      peerInfo,
      chatSwarm,
      channelIds: [sharedChannel.channelId],
    })
    const sharedHello = parseStreamWrites(stream, 'channel-hello').at(-1)
    assert.deepEqual(
      sharedHello.channels.map(channel => channel.channelId),
      [sharedChannel.channelKey]
    )

    core.joinChannelPresence({
      channelName: sharedChannel.channelKey,
      signed: await signPresence(sharedChannel.channelKey, 'online', {
        sessionId: 'shared-session',
        displayName: 'Android',
      }),
    })
    core.joinChannelPresence({
      channelName: privateChannel.channelKey,
      signed: await signPresence(privateChannel.channelKey, 'online', {
        sessionId: 'private-session',
        displayName: 'Android',
      }),
    })
    assert.deepEqual(
      parseStreamWrites(stream, 'channel-presence').map(
        message => message.body.channelId
      ),
      [sharedChannel.channelKey]
    )

    const unrelatedWriterKey = 'f'.repeat(64)
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({
          type: 'channel-hello',
          peerId: 'unrelated-peer',
          channels: [
            {
              channelId: privateChannel.channelKey,
              channelKey: privateChannel.channelKey,
              type: 'public',
              writerCoreKeys: [unrelatedWriterKey],
            },
          ],
        })}\n`
      )
    )
    await waitForTick()

    const currentPrivateChannel = core
      .listChannels()
      .find(channel => channel.channelId === privateChannel.channelId)
    assert.ok(
      !currentPrivateChannel.writerCoreKeys.includes(unrelatedWriterKey)
    )

    const privateTopicBuffer = generateChannelChatDiscoveryKey(
      privateChannel.channelId
    )
    peerInfo.topics.push(privateTopicBuffer)
    peerInfo.emit('topic', privateTopicBuffer)

    let latestHello = parseStreamWrites(stream, 'channel-hello').at(-1)
    assert.deepEqual(
      latestHello.channels.map(channel => channel.channelId),
      [sharedChannel.channelKey]
    )

    const proofMessage = await proveChannelKnowledge({
      stream,
      peerInfo,
      chatSwarm,
      channelIds: [privateChannel.channelId],
    })
    latestHello = parseStreamWrites(stream, 'channel-hello').at(-1)
    assert.deepEqual(
      latestHello.channels.map(channel => channel.channelId).sort(),
      [privateChannel.channelKey, sharedChannel.channelKey].sort()
    )

    const helloCount = parseStreamWrites(stream, 'channel-hello').length
    stream.emit('data', b4a.from(`${JSON.stringify(proofMessage)}\n`))
    await waitForTick()
    assert.equal(parseStreamWrites(stream, 'channel-hello').length, helloCount)
  })

  it('does not let an unauthorized stream clear accepted presence', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-presence-scope-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const sharedChannel = await core.createChannel({
      name: 'presence-shared',
      discover: false,
    })
    const privateChannel = await core.createChannel({
      name: 'presence-private',
      discover: false,
    })
    const chatSwarm = swarms[1]

    const acceptedStream = new RecordingStream()
    const acceptedPeerInfo = channelPeerInfo(sharedChannel.channelId)
    chatSwarm.emit('connection', acceptedStream, acceptedPeerInfo)
    await proveChannelKnowledge({
      stream: acceptedStream,
      peerInfo: acceptedPeerInfo,
      chatSwarm,
      channelIds: [sharedChannel.channelId],
    })
    acceptedStream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({ v: 2, type: 'channel-presence', ...(await signPresence(sharedChannel.channelKey, 'online', { wallet: remotePresenceWallet, sessionId: 'desktop' })) })}\n`
      )
    )
    await waitFor(
      () =>
        core.getSnapshot().channelPresence[sharedChannel.channelKey]?.length ===
        1,
      'accepted remote presence'
    )

    const unauthorizedStream = new RecordingStream()
    const unauthorizedPeerInfo = channelPeerInfo(privateChannel.channelId)
    chatSwarm.emit('connection', unauthorizedStream, unauthorizedPeerInfo)
    await proveChannelKnowledge({
      stream: unauthorizedStream,
      peerInfo: unauthorizedPeerInfo,
      chatSwarm,
      channelIds: [privateChannel.channelId],
    })
    unauthorizedStream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({ v: 2, type: 'channel-presence', ...(await signPresence(sharedChannel.channelKey, 'offline', { wallet: remotePresenceWallet, sessionId: 'desktop' })) })}\n`
      )
    )
    await waitForTick()
    unauthorizedStream.emit('close')
    await waitForTick()

    assert.equal(
      core.getSnapshot().channelPresence[sharedChannel.channelKey]?.length,
      1
    )
  })
})

describe('mobile channel metadata management', () => {
  it('reads v1 text from local storage without advertising the old writer', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mobile-old-chat-')
    )
    const store = new Corestore(storagePath, {
      primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
      unsafe: true,
    })
    const name = 'old-chat-room'
    const writer = store
      .namespace('channel-' + name)
      .get({ name: 'v1-writer', valueEncoding: 'json' })
    await writer.append({
      type: 'message',
      timestamp: 123,
      author: 'old-author',
      content: 'offline history',
    })
    const key = writer.key.toString('hex')
    await store.close()
    await fs.writeFile(
      path.join(storagePath, CHANNELS_FILE),
      JSON.stringify([
        {
          channelId: name,
          channelKey: name,
          localWriterCoreKey: key,
          writerCoreKeys: [key],
        },
      ])
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    const [message] = await core.getChannelMessages(name)
    assert.equal(message.type, 'legacy')
    assert.equal(message.content, 'offline history')
    await core.setChannelRemark({ channelName: name, remark: 'keep' })
    const [persisted] = JSON.parse(
      await fs.readFile(path.join(storagePath, CHANNELS_FILE), 'utf8')
    )
    assert.deepEqual(persisted.writerCoreKeys, [persisted.localWriterCoreKey])
    assert.notEqual(persisted.localWriterCoreKey, key)
  })
  it('loads earlier history without replacing the latest conversation preview', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-history-')
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    const channel = await core.createChannel({
      name: 'history',
      discover: false,
    })
    for (let index = 0; index < 105; index += 1) {
      await core.sendChannelMessage(
        await signedInput(core, {
          channelName: channel.channelKey,
          content: `message-${index}`,
        })
      )
    }
    const recent = await core.getChannelMessages({
      channelName: channel.channelKey,
      limit: 100,
    })
    assert.equal(recent.length, 100)
    assert.equal(recent[0].content, 'message-5')
    assert.equal(recent.at(-1).content, 'message-104')
    const earlier = await core.getChannelMessages({
      channelName: channel.channelKey,
      limit: 100,
      offset: 100,
    })
    assert.deepEqual(
      earlier.map(message => message.content),
      ['message-0', 'message-1', 'message-2', 'message-3', 'message-4']
    )
    assert.equal(
      core.getSnapshot().channelMessages[channel.channelKey].at(-1).content,
      'message-104'
    )
    await core.sendChannelMessage(
      await signedInput(core, {
        channelName: channel.channelKey,
        content: 'message-105',
      })
    )
    assert.equal(
      core.getSnapshot().channelMessages[channel.channelKey].at(-1).content,
      'message-105'
    )
  })

  it('sets remark, pins, leaves, and persists metadata across restart', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-channel-meta-')
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

    const firstSwarms = []
    const firstCore = createCore(firstSwarms)
    await firstCore.start()
    const created = await firstCore.createChannel({
      name: 'android-meta',
      discover: false,
    })

    const renamed = await firstCore.setChannelRemark({
      channelName: created.channelKey,
      remark: 'Mobile team',
    })
    assert.equal(renamed.remark, 'Mobile team')

    const pinned = await firstCore.setChannelPinned({
      channelName: created.channelKey,
      pinned: true,
    })
    assert.equal(pinned.pinned, true)

    await firstCore.stop()

    const restartedSwarms = []
    const restartedCore = createCore(restartedSwarms)
    await restartedCore.start()
    const [restored] = restartedCore.listChannels()
    assert.equal(restored.remark, 'Mobile team')
    assert.equal(restored.pinned, true)

    restartedCore.joinChannelPresence({
      channelName: restored.channelKey,
      signed: await signPresence(restored.channelKey, 'online', {
        sessionId: 'android-leave-test',
        displayName: 'Android',
      }),
    })
    const chatSwarm = restartedSwarms[1]
    const stream = new RecordingStream()
    const peerInfo = channelPeerInfo(restored.channelId)
    chatSwarm.emit('connection', stream, peerInfo)
    await proveChannelKnowledge({
      stream,
      peerInfo,
      chatSwarm,
      channelIds: [restored.channelId],
    })
    stream.emit(
      'data',
      b4a.from(
        `${JSON.stringify({ v: 2, type: 'channel-presence', ...(await signPresence(restored.channelKey, 'online', { wallet: remotePresenceWallet, sessionId: 'web', displayName: 'Desktop' })) })}\n`
      )
    )
    await waitForTick()
    await restartedCore.sendChannelMessage(
      await signedInput(restartedCore, {
        channelName: restored.channelKey,
        authorName: 'Android',
        content: 'before leave',
      })
    )
    await restartedCore.getChannelMessages({
      channelName: restored.channelKey,
    })
    assert.equal(
      restartedCore.getSnapshot().channelPresence[restored.channelKey].length,
      2
    )
    assert.equal(
      restartedCore.getSnapshot().channelMessages[restored.channelKey].length,
      1
    )

    const leaveResult = await restartedCore.leaveChannel({
      channelName: restored.channelKey,
    })
    assert.equal(leaveResult.channelKey, restored.channelKey)
    assert.deepEqual(restartedCore.listChannels(), [])
    assert.equal(
      Object.hasOwn(
        restartedCore.getSnapshot().channelMessages,
        restored.channelKey
      ),
      false
    )
    assert.equal(
      Object.hasOwn(
        restartedCore.getSnapshot().channelPresence,
        restored.channelKey
      ),
      false
    )
  })

  it('deduplicates concurrent message retries and retains their identity after restart', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-retry-')
    )
    assert.ok(
      path.resolve(storagePath).startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
    const createCore = () =>
      new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory([]),
      })
    let core = createCore()
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    const channel = await core.createChannel({
      name: 'android-retry',
      discover: false,
    })
    const fields = {
      channelName: channel.channelKey,
      content: 'one logical message',
      authorName: 'Android',
      id: '550e8400-e29b-41d4-a716-446655440000',
    }
    const input = await signedInput(core, fields)
    const [first, repeated] = await Promise.all([
      core.sendChannelMessage(input),
      core.sendChannelMessage(input),
    ])
    assert.deepEqual(repeated, first)
    assert.equal(first.clientMessageId, fields.id)
    assert.equal(
      (await core.getChannelMessages({ channelName: channel.channelKey }))
        .length,
      1
    )
    await core.stop()
    core = createCore()
    await core.start()
    const restarted = await core.sendChannelMessage(input)
    assert.deepEqual(restarted, first)
    assert.equal(
      (await core.getChannelMessages({ channelName: channel.channelKey }))
        .length,
      1
    )
    await assert.rejects(
      core.sendChannelMessage(
        await signedInput(core, { ...fields, content: 'different content' })
      ),
      /already identifies another message/
    )
    await assert.rejects(
      core.sendChannelMessage({
        ...input,
        signed: {
          ...input.signed,
          body: { ...input.signed.body, id: 'invalid' },
        },
      }),
      /invalid id/
    )
    await core.sendChannelMessage(
      await signedInput(core, { ...fields, wallet: Wallet.createRandom() })
    )
    assert.equal(
      (await core.getChannelMessages({ channelName: channel.channelKey }))
        .length,
      2
    )
  })

  it(
    'saves and retries offline while another writer has missing history blocks',
    { timeout: 5000 },
    async t => {
      const storagePath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mostbox-mobile-sparse-history-')
      )
      assert.ok(
        path
          .resolve(storagePath)
          .startsWith(path.resolve(os.tmpdir()) + path.sep)
      )
      const core = new MobileP2PCore({
        storagePath,
        createSwarm: createRecordingSwarmFactory([]),
      })
      let externalStore = null
      t.after(async () => {
        await externalStore?.close()
        await core.stop()
        await fs.rm(storagePath, { recursive: true, force: true })
      })
      await core.start()
      const channel = await core.createChannel({
        name: 'android-sparse-history',
        discover: false,
      })
      await core.stop()
      const channelsPath = path.join(storagePath, CHANNELS_FILE)
      const records = JSON.parse(await fs.readFile(channelsPath, 'utf8'))
      externalStore = new Corestore(storagePath, {
        primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
        unsafe: true,
      })
      await externalStore.ready()
      const peerCore = externalStore
        .namespace(`channel-${channel.channelKey}`)
        .get({ name: 'another-writer', valueEncoding: 'json' })
      await peerCore.ready()
      await peerCore.append({
        type: 'message',
        content: 'Only the offline peer still has this body',
        author: 'peer',
        timestamp: Date.now(),
      })
      await peerCore.clear(0, peerCore.length)
      assert.equal(peerCore.length, 1)
      assert.equal(await peerCore.has(0), false)
      assert.equal(await peerCore.get(0, { wait: false }), null)
      records[0].writerCoreKeys.push(b4a.toString(peerCore.key, 'hex'))
      await fs.writeFile(channelsPath, JSON.stringify(records))
      await externalStore.close()
      externalStore = null
      await core.start()
      const input = await signedInput(core, {
        channelName: channel.channelKey,
        content: 'A new offline message',
        id: '550e8400-e29b-41d4-a716-446655440002',
      })
      const first = await core.sendChannelMessage(input)
      const repeated = await core.sendChannelMessage(input)
      assert.deepEqual(repeated, first)
      assert.equal(first.clientMessageId, input.signed.body.id)
      assert.deepEqual(core.getSnapshot().channelMessages[channel.channelKey], [
        first,
      ])
    }
  )

  it('rejects a changed attachment on retry and keeps sends with distinct ids distinct', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-attachment-retry-')
    )
    assert.ok(
      path.resolve(storagePath).startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })
    await core.start()
    const channel = await core.createChannel({
      name: 'android-audio-retry',
      discover: false,
    })
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    const link = `most://${cid}?filename=voice.m4a`
    const fields = {
      channelName: channel.channelKey,
      content: link,
      id: '550e8400-e29b-41d4-a716-446655440001',
      attachment: {
        kind: 'audio',
        cid,
        fileName: 'voice.m4a',
        link,
        mimeType: 'audio/mp4',
        size: 123,
      },
    }
    await core.sendChannelMessage(await signedInput(core, fields))
    await assert.rejects(
      core.sendChannelMessage(
        await signedInput(core, {
          ...fields,
          attachment: { ...fields.attachment, size: 456 },
        })
      ),
      /already identifies another message/
    )
    const repeatedText = {
      channelName: channel.channelKey,
      content: 'repeated text',
    }
    await Promise.all([
      core.sendChannelMessage(await signedInput(core, repeatedText)),
      core.sendChannelMessage(await signedInput(core, repeatedText)),
    ])
    assert.equal(
      (await core.getChannelMessages({ channelName: channel.channelKey }))
        .length,
      3
    )
  })

  it('preserves valid peer message ids and drops invalid ids without dropping legacy content', () => {
    const input = {
      content: 'peer message',
      author: 'peer',
      clientMessageId: '550E8400-E29B-41D4-A716-446655440000',
      timestamp: 100,
    }
    const message = normalizeChannelMessage(input)
    assert.equal(message.clientMessageId, input.clientMessageId.toLowerCase())
    const invalid = normalizeChannelMessage({
      ...input,
      clientMessageId: 'bad',
    })
    assert.equal(Object.hasOwn(invalid, 'clientMessageId'), false)
    assert.equal(invalid.content, input.content)
    assert.equal(
      sortChannelMessages([
        { ...message, _coreKey: 'a' },
        { ...message, _coreKey: 'b' },
      ]).length,
      1
    )
  })

  it('round-trips structured attachment messages through the core', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-attachment-message-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-attachment',
      discover: false,
    })
    const link =
      'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png'

    await core.sendChannelMessage(
      await signedInput(core, {
        channelName: channel.channelKey,
        authorName: 'Android',
        content: link,
        attachment: {
          kind: 'image',
          cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
          fileName: 'photo.png',
          link,
          mimeType: 'image/png',
          size: 12345,
        },
      })
    )

    const [message] = await core.getChannelMessages({
      channelName: channel.channelKey,
    })
    assert.equal(message.content, link)
    assert.equal(
      message.attachment.cid,
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    )
    assert.equal(message.attachment.fileName, 'photo.png')
    assert.equal(message.attachment.kind, 'image')
  })

  it('rejects local attachment sends when content does not match the link', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-attachment-content-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-attachment-content',
      discover: false,
    })

    await assert.rejects(
      core.sendChannelMessage(
        await signedInput(core, {
          channelName: channel.channelKey,
          authorName: 'Android',
          content: 'photo.png',
          attachment: {
            kind: 'image',
            cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
            fileName: 'photo.png',
            link: 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png',
          },
        })
      ),
      /invalid attachment/
    )
  })

  it('drops malformed remote attachment payloads when reading messages', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-malformed-attachment-')
    )
    const cores = []
    let externalStore = null
    t.after(async () => {
      await externalStore?.close()
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

    const swarms = []
    const core = createCore(swarms)
    await core.start()
    const channel = await core.createChannel({
      name: 'android-malformed-attachment',
      discover: false,
    })
    const [persistedChannel] = JSON.parse(
      await fs.readFile(path.join(storagePath, CHANNELS_FILE), 'utf8')
    )
    await core.stop()

    externalStore = new Corestore(storagePath, {
      primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
      unsafe: true,
    })
    await externalStore.ready()
    // The writer core key pair comes from the node secret (channel-keys.md §6.1).
    const nodeSecret = b4a.from(
      (
        await fs.readFile(path.join(storagePath, 'cid-drive-secret'), 'utf8')
      ).trim(),
      'hex'
    )
    const keyPair = channelWriterKeyPair(
      nodeSecret,
      channel.channelKey,
      persistedChannel.writerGeneration
    )
    const externalCore = externalStore
      .namespace(`channel-${channel.channelKey}`)
      .get({
        keyPair,
        manifest: { version: 1, signers: [{ publicKey: keyPair.publicKey }] },
        valueEncoding: 'json',
      })
    await externalCore.ready()
    // Correctly signed, so it is shown; the attachment is not, as it is not
    // in normal form.
    await externalCore.append(
      buildSignedEntry(
        await signMessage(channel.channelKey, 'bad attachment', {
          authorName: 'Remote',
          attachment: {
            kind: 'image',
            cid: '',
            fileName: 'bad.png',
            link: 'https://example.invalid/bad.png',
          },
        }),
        Date.now()
      )
    )
    await externalStore.close()
    externalStore = null

    const restartedSwarms = []
    const restartedCore = createCore(restartedSwarms)
    await restartedCore.start()
    const [message] = await restartedCore.getChannelMessages({
      channelName: channel.channelKey,
    })
    assert.equal(message.content, 'bad attachment')
    assert.equal(Object.hasOwn(message, 'attachment'), false)
    assert.equal(
      Object.hasOwn(
        restartedCore.getSnapshot().channelMessages[channel.channelKey][0],
        'attachment'
      ),
      false
    )
  })

  it('ignores append messages that resume after a channel is left', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-stale-append-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const originalGet = Hypercore.prototype.get
    const blocked = deferred()
    const release = deferred()
    let blockedOnce = false
    t.after(async () => {
      Hypercore.prototype.get = originalGet
      release.resolve()
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    Hypercore.prototype.get = async function delayedGet(...args) {
      const entry = await originalGet.apply(this, args)
      if (
        entry?.type === 'signed' &&
        entry.body?.content === 'stale after leave' &&
        !blockedOnce
      ) {
        blockedOnce = true
        blocked.resolve()
        await release.promise
      }
      return entry
    }

    await core.start()
    const channel = await core.createChannel({
      name: 'android-stale-append',
      discover: false,
    })

    const sendPromise = core.sendChannelMessage(
      await signedInput(core, {
        channelName: channel.channelKey,
        authorName: 'Android',
        content: 'stale after leave',
      })
    )
    await blocked.promise

    await core.leaveChannel({
      channelName: channel.channelKey,
    })
    release.resolve()
    await sendPromise
    await waitForTick()

    assert.equal(
      Object.hasOwn(core.getSnapshot().channelMessages, channel.channelKey),
      false
    )
    assert.deepEqual(core.listChannels(), [])
  })

  it('returns empty history when getChannelMessages resumes after leave', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-stale-history-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    const originalGet = Hypercore.prototype.get
    const blocked = deferred()
    const release = deferred()
    let blockedOnce = false
    t.after(async () => {
      Hypercore.prototype.get = originalGet
      release.resolve()
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const channel = await core.createChannel({
      name: 'android-stale-history',
      discover: false,
    })
    await core.sendChannelMessage(
      await signedInput(core, {
        channelName: channel.channelKey,
        authorName: 'Android',
        content: 'history after leave',
      })
    )

    Hypercore.prototype.get = async function delayedGet(...args) {
      const entry = await originalGet.apply(this, args)
      if (
        entry?.type === 'signed' &&
        entry.body?.content === 'history after leave' &&
        !blockedOnce
      ) {
        blockedOnce = true
        blocked.resolve()
        await release.promise
      }
      return entry
    }

    const messagesPromise = core.getChannelMessages({
      channelName: channel.channelKey,
    })
    await blocked.promise

    await core.leaveChannel({
      channelName: channel.channelKey,
    })
    release.resolve()
    const messages = await messagesPromise
    await waitForTick()

    assert.deepEqual(messages, [])
    assert.equal(
      Object.hasOwn(core.getSnapshot().channelMessages, channel.channelKey),
      false
    )
    assert.deepEqual(core.listChannels(), [])
  })

  it('rejoins with the same deterministic writer core after leaving a channel', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-clear-candidate-')
    )
    const swarms = []
    const core = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    t.after(async () => {
      await core.stop()
      await fs.rm(storagePath, { recursive: true, force: true })
    })

    await core.start()
    const firstChannel = await core.createChannel({
      name: 'android-clear-candidate',
      discover: false,
    })
    const oldWriterCoreKey = firstChannel.localWriterCoreKey
    assert.match(oldWriterCoreKey, /^[0-9a-f]{64}$/)

    await core.leaveChannel({
      channelName: firstChannel.channelKey,
    })

    // v2: this node's writer core key is derived from its node secret and the
    // channel, so rejoining reopens the same core rather than a stale cache.
    const recreated = await core.createChannel({
      name: 'android-clear-candidate',
    })
    assert.equal(recreated.localWriterCoreKey, oldWriterCoreKey)
    assert.deepEqual(recreated.writerCoreKeys, [oldWriterCoreKey])
  })
})

describe('mobile channel cores with missing blocks', () => {
  // Another writer's core held here only in part, with the writer offline:
  // start and reads must not wait for the missing block, and the block must
  // be fetched once a peer that has it connects.
  it('starts and reads with a remote block missing, then refetches it', async t => {
    const storagePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-partial-core-')
    )
    const writerPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-mobile-partial-writer-')
    )
    const stores = []
    const cores = []
    t.after(async () => {
      await Promise.allSettled(cores.map(core => core.stop()))
      await Promise.allSettled(stores.map(store => store.close()))
      await fs.rm(storagePath, { recursive: true, force: true })
      await fs.rm(writerPath, { recursive: true, force: true })
    })
    const openStore = directory => {
      const store = new Corestore(directory, {
        primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
        unsafe: true,
      })
      stores.push(store)
      return store
    }
    const contents = async core =>
      (
        await core.getChannelMessages({
          channelName: channel.channelKey,
          limit: 100,
        })
      ).map(message => message.content)

    const first = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory([]),
    })
    cores.push(first)
    await first.start()
    const channel = await first.createChannel({
      name: 'android-partial-core',
      discover: false,
    })
    await first.stop()

    // The remote writer, in its own store.
    const writerStore = openStore(writerPath)
    const writerCore = writerStore
      .namespace(`channel-${channel.channelKey}`)
      .get({ name: 'remote-writer', valueEncoding: 'json' })
    await writerCore.ready()
    for (const content of ['one', 'two', 'three']) {
      await writerCore.append(
        buildSignedEntry(
          await signMessage(channel.channelKey, content, {
            authorName: 'Remote',
          }),
          Date.now()
        )
      )
    }
    const writerKey = b4a.toString(writerCore.key, 'hex')

    // Copy it into the phone's store, then drop the middle block.
    const phoneStore = openStore(storagePath)
    const copy = phoneStore
      .namespace(`channel-${channel.channelKey}`)
      .get({ key: writerCore.key, valueEncoding: 'json' })
    await copy.ready()
    const left = writerStore.replicate(true)
    const right = phoneStore.replicate(false)
    left.pipe(right).pipe(left)
    await copy.download({ start: 0, end: 3 }).done()
    left.destroy()
    right.destroy()
    await copy.clear(1)
    assert.equal(await copy.has(1), false)
    await phoneStore.close()
    stores.splice(stores.indexOf(phoneStore), 1)

    const channelsPath = path.join(storagePath, CHANNELS_FILE)
    const persisted = JSON.parse(await fs.readFile(channelsPath, 'utf8'))
    persisted[0].writerCoreKeys = [...persisted[0].writerCoreKeys, writerKey]
    await fs.writeFile(channelsPath, JSON.stringify(persisted))

    const swarms = []
    const phone = new MobileP2PCore({
      storagePath,
      createSwarm: createRecordingSwarmFactory(swarms),
    })
    cores.push(phone)
    const timeout = label =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(label)), 10000)
      )
    await Promise.race([phone.start(), timeout('start hung')])
    const partial = await Promise.race([contents(phone), timeout('read hung')])
    assert.ok(partial.includes('one'))
    assert.ok(!partial.includes('three'))

    // A peer holding the writer's core connects on the file swarm.
    const local = Hypercore.createProtocolStream(true)
    const remote = Hypercore.createProtocolStream(false)
    local.pipe(remote).pipe(local)
    writerStore.replicate(local)
    swarms[0].emit('connection', remote)
    t.after(() => {
      local.destroy()
      remote.destroy()
    })
    const deadline = Date.now() + 10000
    while (!(await contents(phone)).includes('three')) {
      assert.ok(Date.now() < deadline, 'missing block was not fetched again')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  })
})
