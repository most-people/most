import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const key = value => Buffer.alloc(32, value)
const topic = key(100)

// Only transport timing is simulated. Discovery, queue priority, connection
// state transitions and suspend/resume run the installed production dependency.
export function testSwarmDiscovery(packageUrl) {
  const require = createRequire(packageUrl)
  const Hyperswarm = require('hyperswarm')
  const { version } = require('hyperswarm/package.json')

  function harness(t) {
    const dht = new EventEmitter()
    const attempts = []
    const retrying = new Set()
    const discovered = new Map()
    dht.online = true
    dht.createServer = () => ({
      suspend: async () => {},
      resume: async () => {},
      close: async () => {},
    })
    dht.suspend = async () => {}
    dht.resume = async () => {}
    dht.destroy = async () => {}
    dht.connect = publicKey => {
      const conn = new EventEmitter()
      conn.remotePublicKey = publicKey
      conn.sendKeepAlive = () => {}
      conn.destroy = () => queueMicrotask(() => conn.emit('close'))
      attempts.push(conn)
      return conn
    }
    const swarm = new Hyperswarm({ dht, maxParallel: 1 })
    swarm._timer.destroy()
    swarm._timer = {
      add(peer) {
        retrying.add(peer)
        return true
      },
      destroy: () => retrying.clear(),
      backoffs: [60000, 60000, 60000, 60000],
      jitter: 0,
    }
    const discover = (value, address = '127.0.0.1') => {
      const peer = {
        publicKey: key(value),
        relayAddresses: [{ host: address, port: 1 }],
      }
      discovered.set(value, peer)
      swarm._handlePeer(peer, topic)
      return swarm.peers.get(peer.publicKey.toString('hex'))
    }
    swarm._discovery.set(topic.toString('hex'), {
      destroy: async () => {},
      suspend: async () => {},
      refresh: async () => {
        for (const peer of discovered.values()) swarm._handlePeer(peer, topic)
      },
      resume: () => {
        for (const peer of discovered.values()) swarm._handlePeer(peer, topic)
      },
    })
    t.after(() => swarm.destroy({ force: true }))
    return {
      swarm,
      attempts,
      discover,
      retrying,
      fail: conn => conn.emit('close'),
      retry: peer => {
        retrying.delete(peer)
        swarm._requeue([peer])
      },
    }
  }

  describe(`Hyperswarm ${version} discovery retry fairness`, () => {
    it('keeps failed peers in backoff when discovery repeats', t => {
      const { swarm, attempts, discover, fail } = harness(t)
      const peer = discover(1)
      fail(attempts[0])
      assert.equal(peer.attempts, 1)
      assert.equal(peer.waiting, true)
      discover(1, '127.0.0.2')
      assert.equal(peer.attempts, 1, 'rediscovery must not erase failures')
      assert.equal(attempts.length, 1, 'rediscovery must respect backoff')
      assert.equal(peer.relayAddresses[0].host, '127.0.0.2')
      assert.equal(swarm.connecting, 0)
    })

    it('tries a fresh seed before retrying an unproven peer', t => {
      const { attempts, discover, fail, retry } = harness(t)
      const stale = discover(1)
      fail(attempts[0])
      discover(2) // Occupy the only slot while both candidates are queued.
      discover(3)
      retry(stale)
      fail(attempts[1])
      assert.deepEqual(attempts[2].remotePublicKey, key(3))
      assert.equal(stale.attempts, 1)
      assert.equal(stale.tried, true)
    })

    it('still retries a failed seed when it becomes reachable', t => {
      const { swarm, attempts, discover, fail, retry } = harness(t)
      const peer = discover(1)
      fail(attempts[0])
      discover(1)
      retry(peer)
      assert.equal(attempts.length, 2)
      attempts[1].emit('open')
      assert.equal(swarm.connections.size, 1)
      assert.equal(peer.proven, true)
    })

    it('preserves fast reconnection for a proven peer', t => {
      const { attempts, discover, fail, retry } = harness(t)
      const proven = discover(1)
      attempts[0].emit('open')
      fail(attempts[0])
      discover(2)
      discover(3)
      retry(proven)
      fail(attempts[1])
      assert.deepEqual(attempts[2].remotePublicKey, key(1))
      assert.equal(proven.proven, true)
    })

    it('does not bypass backoff on a network update', async t => {
      const { swarm, attempts, discover, fail, retry } = harness(t)
      const peer = discover(1)
      fail(attempts[0])
      await swarm._handleNetworkChange()
      assert.equal(attempts.length, 1)
      retry(peer)
      assert.equal(attempts.length, 2)
    })

    it('requeues waiting and queued peers after suspend/resume', async t => {
      const { swarm, attempts, discover, fail } = harness(t)
      const waiting = discover(1)
      fail(attempts[0])
      discover(2)
      const queued = discover(3)
      assert.equal(waiting.waiting, true)
      assert.equal(queued.queued, true)
      await swarm.suspend()
      await swarm.resume()
      assert.equal(waiting.waiting, false)
      assert.equal(waiting.queued, true)
      // A connection closed by suspend may be garbage-collected and freshly
      // rediscovered, tying the untouched peer's priority. Either may go first.
      if (!attempts.at(-1).remotePublicKey.equals(key(3))) fail(attempts.at(-1))
      assert.deepEqual(attempts.at(-1).remotePublicKey, key(3))
    })
  })
}
