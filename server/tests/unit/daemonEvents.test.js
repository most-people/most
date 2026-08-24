import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { bindEngineEvents } from '../../index.js'

test('seed diagnostics throttle metrics and release per-CID state', () => {
  const engine = new EventEmitter()
  const logs = []
  const websocketEvents = []
  let statusBroadcasts = 0
  const events = bindEngineEvents({
    engine,
    wsBroadcast: (event, data) => websocketEvents.push({ event, data }),
    wsSendToChannel: () => {},
    appendNodeLog: entry => logs.push(entry),
    broadcastNodeStatus: () => {
      statusBroadcasts += 1
    },
  })
  events.markReady()

  const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
  const seedState = { cid, status: 'active', topic: 'ab'.repeat(32) }
  const metrics = {
    cid,
    peerCount: 1,
    lastServedAt: '2026-08-24T00:00:00.000Z',
    totalServedBytes: 10,
  }

  engine.emit('seed:state', seedState)
  engine.emit('seed:state', seedState)
  engine.emit('seed:metrics', metrics)
  engine.emit('seed:metrics', { ...metrics, totalServedBytes: 20 })

  assert.strictEqual(
    logs.filter(entry => entry.event === 'node:seed:active').length,
    1
  )
  assert.strictEqual(
    logs.filter(entry => entry.event === 'node:seed:metrics').length,
    1
  )
  assert.strictEqual(
    websocketEvents.filter(entry => entry.event === 'seed:metrics').length,
    2
  )

  engine.emit('seed:state:removed', { cid })
  engine.emit('seed:state', seedState)
  engine.emit('seed:metrics', metrics)

  assert.strictEqual(
    logs.filter(entry => entry.event === 'node:seed:active').length,
    2
  )
  assert.strictEqual(
    logs.filter(entry => entry.event === 'node:seed:metrics').length,
    2
  )
  assert.strictEqual(statusBroadcasts, 5)
})
