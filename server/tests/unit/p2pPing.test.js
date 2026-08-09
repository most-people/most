import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'

import {
  createP2PPingFrameDecoder,
  deriveP2PPingTopic,
  generateP2PPingCode,
  P2PPingManager,
  validateP2PPingCode,
} from '../../src/core/p2pPing.js'

function deterministicRandomBytes(size) {
  const bytes = Buffer.alloc(size)
  if (size === 4) bytes.writeUInt32BE(42)
  else bytes.fill(size)
  return bytes
}

async function waitFor(predicate, timeoutMs = 1000) {
  const expiresAt = Date.now() + timeoutMs
  while (Date.now() < expiresAt) {
    const value = predicate()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for test condition')
}

class MemoryConnection extends EventEmitter {
  constructor(publicKey) {
    super()
    this.remotePublicKey = publicKey
    this.destroyed = false
    this.peer = null
  }

  write(chunk) {
    if (this.destroyed) throw new Error('Connection is closed')
    const data = Buffer.from(chunk)
    queueMicrotask(() => {
      if (!this.peer?.destroyed) this.peer.emit('data', data)
    })
    return true
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.emit('close')
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroyed = true
      this.peer.emit('close')
    }
  }
}

class MemoryPingNetwork {
  constructor() {
    this.entries = []
    this.swarms = []
    this.nextKey = 1
  }

  createSwarm = () => {
    const swarm = new EventEmitter()
    swarm.keyPair = { publicKey: Buffer.alloc(32, this.nextKey++) }
    swarm.peers = new Set()
    swarm.connections = new Set()
    swarm.destroyed = false
    swarm.join = (topic, options) => {
      const entry = {
        swarm,
        topic: Buffer.from(topic),
        options,
        destroyed: false,
      }
      return {
        flushed: async () => {
          this.entries.push(entry)
          queueMicrotask(() => this.connectEligible())
          return true
        },
        destroy: async () => {
          entry.destroyed = true
        },
      }
    }
    swarm.destroy = async () => {
      swarm.destroyed = true
      for (const connection of swarm.connections) connection.destroy()
      swarm.connections.clear()
    }
    this.swarms.push(swarm)
    return swarm
  }

  connectEligible() {
    for (const host of this.entries) {
      if (host.destroyed || !host.options.server || host.connected) continue
      const join = this.entries.find(
        candidate =>
          !candidate.destroyed &&
          candidate.options.client &&
          !candidate.connected &&
          candidate.topic.equals(host.topic)
      )
      if (!join) continue

      host.connected = true
      join.connected = true
      const hostConnection = new MemoryConnection(join.swarm.keyPair.publicKey)
      const joinConnection = new MemoryConnection(host.swarm.keyPair.publicKey)
      hostConnection.peer = joinConnection
      joinConnection.peer = hostConnection
      host.swarm.connections.add(hostConnection)
      join.swarm.connections.add(joinConnection)
      host.swarm.peers.add(join.swarm.keyPair.publicKey)
      join.swarm.peers.add(host.swarm.keyPair.publicKey)
      host.swarm.emit('update')
      join.swarm.emit('update')
      host.swarm.emit('connection', hostConnection, {
        publicKey: join.swarm.keyPair.publicKey,
      })
      join.swarm.emit('connection', joinConnection, {
        publicKey: host.swarm.keyPair.publicKey,
      })
    }
  }
}

describe('P2P Ping protocol', () => {
  it('preserves leading zeroes and rejects invalid codes', () => {
    assert.equal(generateP2PPingCode(deterministicRandomBytes), '000042')
    assert.equal(validateP2PPingCode('000042'), '000042')
    for (const value of ['42', '0000042', '12a456', 123456, null]) {
      assert.throws(() => validateP2PPingCode(value), {
        code: 'VALIDATION_ERROR',
      })
    }
  })

  it('matches the topic golden sample', () => {
    assert.equal(
      deriveP2PPingTopic('000042').toString('hex'),
      '76181be378cb3cdeb40c42254fb657e576699291c53ae3add926c5c051d2b19a'
    )
  })

  it('rejects malformed and oversized frames', () => {
    const errors = []
    const decode = createP2PPingFrameDecoder(
      () => {},
      error => errors.push(error)
    )
    decode('{not-json}\n')
    decode(`${'x'.repeat(5000)}\n`)
    assert.equal(errors.length, 2)
  })

  it('completes encrypted-stream Ping, Pong, and Ack in both directions', async () => {
    const network = new MemoryPingNetwork()
    const host = new P2PPingManager({
      createSwarm: network.createSwarm,
      randomBytes: deterministicRandomBytes,
      hostTtlMs: 500,
    })
    const join = new P2PPingManager({
      createSwarm: network.createSwarm,
      randomBytes: deterministicRandomBytes,
      joinTimeoutMs: 500,
    })

    const hostRecord = await host.start({ role: 'host' })
    const joinRecord = await join.start({ role: 'join', code: hostRecord.code })
    await waitFor(
      () =>
        host.get(hostRecord.id)?.status === 'success' &&
        join.get(joinRecord.id)?.status === 'success'
    )

    assert.equal(
      host.get(hostRecord.id).remotePeerKey,
      Buffer.alloc(32, 2).toString('hex')
    )
    assert.equal(
      join.get(joinRecord.id).remotePeerKey,
      Buffer.alloc(32, 1).toString('hex')
    )
    assert.deepEqual(
      network.entries.map(entry => entry.options),
      [
        { server: true, client: false },
        { server: false, client: true },
      ]
    )
    await host.destroy()
    await join.destroy()
  })

  it('does not connect a different six-digit code', async () => {
    const network = new MemoryPingNetwork()
    const host = new P2PPingManager({
      createSwarm: network.createSwarm,
      randomBytes: deterministicRandomBytes,
      hostTtlMs: 100,
    })
    const join = new P2PPingManager({
      createSwarm: network.createSwarm,
      randomBytes: deterministicRandomBytes,
      joinTimeoutMs: 25,
    })
    await host.start({ role: 'host' })
    const joinRecord = await join.start({ role: 'join', code: '000043' })
    const result = await waitFor(() => {
      const current = join.get(joinRecord.id)
      return current?.status === 'failed' ? current : null
    })
    assert.equal(result.errorCode, 'PEER_NOT_FOUND')
    await host.destroy()
    await join.destroy()
  })

  it('distinguishes announce, connection, and handshake failures', async () => {
    const announceManager = new P2PPingManager({
      createSwarm: () => {
        const swarm = new EventEmitter()
        swarm.keyPair = { publicKey: Buffer.alloc(32) }
        swarm.peers = new Set()
        swarm.join = () => ({
          flushed: async () => {
            throw new Error('announce failed')
          },
          destroy: async () => {},
        })
        swarm.destroy = async () => {}
        return swarm
      },
      randomBytes: deterministicRandomBytes,
    })
    const announced = await announceManager.start({ role: 'host' })
    assert.equal(
      await waitFor(() => announceManager.get(announced.id)?.errorCode),
      'ANNOUNCE_FAILED'
    )

    const createSilentSwarm = ({
      withPeer = false,
      withConnection = false,
    } = {}) => {
      const swarm = new EventEmitter()
      swarm.keyPair = { publicKey: Buffer.alloc(32, 3) }
      swarm.peers = new Set(withPeer ? [Buffer.alloc(32, 4)] : [])
      swarm.join = () => ({
        flushed: async () => true,
        destroy: async () => {},
      })
      swarm.destroy = async () => {}
      if (withConnection) {
        queueMicrotask(() => {
          const connection = new MemoryConnection(Buffer.alloc(32, 4))
          swarm.emit('connection', connection, {
            publicKey: connection.remotePublicKey,
          })
        })
      } else if (withPeer) {
        queueMicrotask(() => swarm.emit('update'))
      }
      return swarm
    }

    const connectionManager = new P2PPingManager({
      createSwarm: () => createSilentSwarm({ withPeer: true }),
      randomBytes: deterministicRandomBytes,
      joinTimeoutMs: 25,
    })
    const connecting = await connectionManager.start({
      role: 'join',
      code: '000042',
    })
    assert.equal(
      await waitFor(() => connectionManager.get(connecting.id)?.errorCode),
      'CONNECTION_FAILED'
    )

    const handshakeManager = new P2PPingManager({
      createSwarm: () =>
        createSilentSwarm({ withPeer: true, withConnection: true }),
      randomBytes: deterministicRandomBytes,
      joinTimeoutMs: 25,
    })
    const verifying = await handshakeManager.start({
      role: 'join',
      code: '000042',
    })
    assert.equal(
      await waitFor(() => handshakeManager.get(verifying.id)?.errorCode),
      'TIMEOUT'
    )
  })

  it('rejects concurrent starts and releases resources on cancellation', async () => {
    const network = new MemoryPingNetwork()
    const manager = new P2PPingManager({
      createSwarm: network.createSwarm,
      randomBytes: deterministicRandomBytes,
      hostTtlMs: 500,
    })
    const record = await manager.start({ role: 'host' })
    await assert.rejects(manager.start({ role: 'host' }), { code: 'CONFLICT' })
    const cancelled = manager.cancel(record.id)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(cancelled.errorCode, 'CANCELLED')
    await waitFor(() => network.swarms[0]?.destroyed)

    const next = await manager.start({ role: 'join', code: '000042' })
    assert.equal(next.status, 'preparing')
    await manager.destroy()
    assert.equal(manager.get(next.id).status, 'cancelled')
  })
})
