import assert from 'node:assert/strict'
import test from 'node:test'
import { getConnectionStatus } from './connectionStatus'

const local = { status: 'ready', mode: 'local', peerCount: 2 } as const
const remote = {
  status: 'ready',
  mode: 'remote',
  authenticated: true,
  peerCount: 2,
  endpoint: 'http://192.168.1.5:1976',
} as const

test('startup, offline and error are never shown as connected', () => {
  const starting = getConnectionStatus({
    node: { ...local, status: 'starting' },
    chatConnected: true,
    hasChannels: true,
  })
  assert.equal(starting.level, 'pending')
  for (const status of ['idle', 'stopping', 'error'] as const) {
    const result = getConnectionStatus({
      node: { ...local, status },
      chatConnected: true,
      hasChannels: true,
    })
    assert.equal(result.level, 'error')
    assert.equal(result.titleKey, 'status.offline.title')
  }
})

test('remote node without login asks the user to sign in', () => {
  const result = getConnectionStatus({
    node: { ...remote, authenticated: false },
    chatConnected: false,
    hasChannels: true,
  })
  assert.equal(result.level, 'warn')
  assert.equal(result.titleKey, 'status.login.title')
  assert.equal(result.params.source, '192.168.1.5:1976')
})

test('remote chat socket down is reconnecting, not connected', () => {
  const result = getConnectionStatus({
    node: remote,
    chatConnected: false,
    hasChannels: true,
  })
  assert.equal(result.level, 'pending')
  assert.equal(result.titleKey, 'status.reconnecting.title')
})

test('zero peers is a warning that explains messages still sync later', () => {
  const result = getConnectionStatus({
    node: { ...local, peerCount: 0 },
    chatConnected: true,
    hasChannels: true,
  })
  assert.equal(result.level, 'warn')
  assert.equal(result.titleKey, 'status.alone.title')
})

test('connected reports peer count and the node source', () => {
  const result = getConnectionStatus({
    node: remote,
    chatConnected: true,
    hasChannels: true,
  })
  assert.equal(result.level, 'ok')
  assert.equal(result.params.count, 2)
  assert.equal(result.detailKey, 'status.connected.remoteDetail')
  assert.equal(
    getConnectionStatus({
      node: local,
      chatConnected: true,
      hasChannels: false,
    }).detailKey,
    'status.connected.localDetail'
  )
})

test('remote node that dropped and is retrying shows reconnecting', () => {
  const result = getConnectionStatus({
    node: {
      ...remote,
      status: 'starting',
      error: 'Reconnecting to remote node',
    },
    chatConnected: false,
    hasChannels: true,
  })
  assert.equal(result.level, 'pending')
  assert.equal(result.titleKey, 'status.reconnecting.title')
})

test('channel peer count overrides the node-wide count', () => {
  const alone = getConnectionStatus({
    node: local,
    chatConnected: true,
    hasChannels: true,
    channelPeers: 0,
  })
  assert.equal(alone.titleKey, 'status.channelAlone.title')
  const joined = getConnectionStatus({
    node: local,
    chatConnected: true,
    hasChannels: true,
    channelPeers: 3,
  })
  assert.equal(joined.titleKey, 'status.channelConnected.title')
  assert.equal(joined.params.count, 3)
})

test('DHT offline is reported before the alone state', () => {
  const result = getConnectionStatus({
    node: { ...local, peerCount: 0, networkOnline: false },
    chatConnected: true,
    hasChannels: true,
  })
  assert.equal(result.level, 'error')
  assert.equal(result.titleKey, 'status.network.title')
})
