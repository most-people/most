// most-cid-drive/3 channel behaviour (docs/protocol/v2/file-privacy.md §4, §9).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import NoiseSecretStream from '@hyperswarm/secret-stream'
import b4a from 'b4a'
import cenc from 'compact-encoding'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Protomux from 'protomux'
import {
  CID_DRIVE_PROTOCOL,
  MAX_INVALID_WANTS,
  attachCidDriveChannel,
  cidDriveName,
  fileTopic,
  wantKeyFor,
} from '../../src/core/cidDriveExchange.js'

const DIGEST = b4a.alloc(32, 7)
const TOPIC = fileTopic(DIGEST)
const WANT_KEY = wantKeyFor(DIGEST)
const DRIVE_KEY = b4a.alloc(32, 9)

function connect() {
  const a = new NoiseSecretStream(true)
  const b = new NoiseSecretStream(false)
  a.rawStream.pipe(b.rawStream).pipe(a.rawStream)
  return [a, b]
}

const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(check, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out')
    await tick(5)
  }
}

/** A seeder for TOPIC that answers only verified wants. */
function attachSeeder(stream, events) {
  return attachCidDriveChannel(stream, {
    onWant: (topic, proof, peer) => {
      events.wants.push(b4a.concat([topic, proof]))
      if (!b4a.equals(topic, TOPIC)) return
      if (peer.verifyWant(topic, proof, WANT_KEY)) peer.have(topic, DRIVE_KEY)
    },
    onHave: () => {},
    onClose: () => {
      events.closed = true
    },
  })
}

function attachRequester(stream, events) {
  return attachCidDriveChannel(stream, {
    onWant: () => {},
    onHave: (topic, driveKey) => events.haves.push([topic, driveKey]),
    onClose: () => {
      events.closed = true
    },
  })
}

describe('most-cid-drive/3 channel', () => {
  it('answers a requester that knows the digest', async () => {
    const [a, b] = connect()
    const seeder = { wants: [] }
    const requester = { haves: [] }
    attachSeeder(b, seeder)
    // Sent before the channel opens: queued until the challenge arrives.
    attachRequester(a, requester).want(TOPIC, WANT_KEY)
    await waitFor(() => requester.haves.length === 1)
    assert.ok(b4a.equals(requester.haves[0][0], TOPIC))
    assert.ok(b4a.equals(requester.haves[0][1], DRIVE_KEY))
    a.destroy()
    b.destroy()
  })

  it('ignores random proofs and closes the channel after 16', async () => {
    const [a, b] = connect()
    const seeder = { wants: [] }
    const requester = { haves: [] }
    attachSeeder(b, seeder)
    // Knows only the topic: guesses a key instead of H(file/want-key, digest).
    const attacker = attachRequester(a, requester)
    // Wants sent before the channel opens are queued per topic; wait for the
    // first to arrive so each later one goes out on its own.
    attacker.want(TOPIC, randomBytes(32))
    await waitFor(() => seeder.wants.length === 1)
    for (let i = 1; i < MAX_INVALID_WANTS - 1; i++) {
      attacker.want(TOPIC, randomBytes(32))
    }
    await waitFor(() => seeder.wants.length === MAX_INVALID_WANTS - 1)
    assert.equal(requester.haves.length, 0)
    assert.equal(seeder.closed, undefined)

    attacker.want(TOPIC, randomBytes(32))
    await waitFor(() => seeder.closed === true)
    // A correct proof after the close gets nothing.
    attacker.want(TOPIC, WANT_KEY)
    await tick(50)
    assert.equal(requester.haves.length, 0)
    a.destroy()
    b.destroy()
  })

  it('rejects a valid want replayed on another connection', async () => {
    // Capture an honest A↔B want.
    const [a, b] = connect()
    const seeder = { wants: [] }
    const honest = { haves: [] }
    attachSeeder(b, seeder)
    attachRequester(a, honest).want(TOPIC, WANT_KEY)
    await waitFor(() => honest.haves.length === 1)
    const captured = seeder.wants[0]

    // Replay its raw payload from C to the same seeder on a new connection,
    // speaking the wire protocol directly.
    const [c, d] = connect()
    const replayed = { wants: [] }
    const replayer = { haves: [] }
    attachSeeder(d, replayed)
    const channel = Protomux.from(c).createChannel({
      protocol: CID_DRIVE_PROTOCOL,
      handshake: cenc.fixed32,
    })
    const want = channel.addMessage({ encoding: cenc.fixed64 })
    channel.addMessage({
      encoding: cenc.fixed64,
      onmessage: message => replayer.haves.push(message),
    })
    channel.open(randomBytes(32))
    await channel.fullyOpened()
    want.send(captured)
    await waitFor(() => replayed.wants.length === 1)
    await tick(50)
    assert.equal(replayer.haves.length, 0)
    for (const stream of [a, b, c, d]) stream.destroy()
  })

  it('does not count wants for topics the node does not seed', async () => {
    const [a, b] = connect()
    const seeder = { wants: [] }
    attachSeeder(b, seeder)
    const requester = attachRequester(a, { haves: [] })
    const other = fileTopic(b4a.alloc(32, 1))
    requester.want(other, wantKeyFor(b4a.alloc(32, 1)))
    await waitFor(() => seeder.wants.length === 1)
    for (let i = 1; i < MAX_INVALID_WANTS + 4; i++) {
      requester.want(other, wantKeyFor(b4a.alloc(32, 1)))
    }
    await waitFor(() => seeder.wants.length === MAX_INVALID_WANTS + 4)
    await tick(50)
    assert.equal(seeder.closed, undefined)
    a.destroy()
    b.destroy()
  })

  it('gives a topic-only peer no way to open the drive over Corestore', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-cid-drive-3-'))
    const stores = ['seed', 'attacker', 'honest'].map(
      name => new Corestore(path.join(dir, name))
    )
    const [seedStore, attackerStore, honestStore] = stores
    const drives = []
    const streams = []
    try {
      const own = new Hyperdrive(
        seedStore.namespace(cidDriveName(randomBytes(32), TOPIC))
      )
      drives.push(own)
      await own.put('/cid', b4a.from('content'))

      // Seed answers only verified wants, with its real drive key.
      const serve = stream =>
        attachCidDriveChannel(stream, {
          onWant: (topic, proof, peer) => {
            if (peer.verifyWant(topic, proof, WANT_KEY)) {
              peer.have(topic, own.key)
            }
          },
          onHave: () => {},
        })
      const link = remoteStore => {
        const left = seedStore.replicate(true)
        const right = remoteStore.replicate(false)
        left.pipe(right).pipe(left)
        streams.push(left, right)
        serve(left)
        return right
      }

      // Attacker: knows the topic, guesses proofs, tries the topic as a key.
      const attackerStream = link(attackerStore)
      const offers = []
      const attacker = attachCidDriveChannel(attackerStream, {
        onWant: () => {},
        onHave: (topic, driveKey) => offers.push(driveKey),
      })
      attacker.want(TOPIC, randomBytes(32))
      const guessed = new Hyperdrive(attackerStore.session(), TOPIC)
      drives.push(guessed)
      await guessed.ready()
      const entry = await Promise.race([
        guessed.entry('/cid', { wait: true, timeout: 500 }).catch(() => null),
        tick(700).then(() => null),
      ])
      assert.equal(entry, null)
      assert.equal(offers.length, 0)

      // Control: a requester that knows the digest reads the content.
      const honestStream = link(honestStore)
      const keys = []
      attachCidDriveChannel(honestStream, {
        onWant: () => {},
        onHave: (topic, driveKey) => keys.push(driveKey),
      }).want(TOPIC, WANT_KEY)
      await waitFor(() => keys.length === 1)
      const remote = new Hyperdrive(honestStore.session(), keys[0])
      drives.push(remote)
      await remote.ready()
      await remote.update({ wait: true })
      assert.equal(
        b4a.toString(await remote.get('/cid', { timeout: 2000 })),
        'content'
      )
    } finally {
      for (const stream of streams) stream.destroy()
      await Promise.allSettled(drives.map(drive => drive.close()))
      await Promise.allSettled(stores.map(store => store.close()))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
