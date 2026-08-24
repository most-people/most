import assert from 'node:assert/strict'
import test from 'node:test'
import { hasActiveTransfers, startPreferredOrLocal } from './nodeSelection'
import type { MobileCoreSnapshot } from './types'

function snapshotWithStatus(
  status: MobileCoreSnapshot['transfers'][number]['status']
): MobileCoreSnapshot {
  return {
    node: { status: 'ready', peerCount: 0, storagePath: '', error: '' },
    holdings: [],
    transfers: [
      {
        id: 'transfer-1',
        kind: 'download',
        status,
        fileName: 'sample.txt',
        progress: 0,
        message: '',
      },
    ],
    p2pPing: null,
    logs: [],
  }
}

test('prefers a saved remote node and keeps local stopped on success', async () => {
  let localStarts = 0
  const result = await startPreferredOrLocal({
    preferred: { url: 'https://node.example.com', invite: 'invite' },
    startRemote: async () => 'remote-node',
    startLocal: async () => {
      localStarts += 1
      return 'local-node'
    },
  })

  assert.equal(result.mode, 'remote')
  assert.equal(result.node, 'remote-node')
  assert.equal(result.fallbackFrom, '')
  assert.equal(localStarts, 0)
})

test('falls back for the session while retaining the failed remote URL', async () => {
  const result = await startPreferredOrLocal({
    preferred: { url: 'http://desktop.local:1976/base', invite: 'invite' },
    startRemote: async () => {
      throw new Error('offline')
    },
    startLocal: async () => 'local-node',
  })

  assert.equal(result.mode, 'local')
  assert.equal(result.node, 'local-node')
  assert.equal(result.fallbackFrom, 'http://desktop.local:1976/base')
})

test('treats queued, running and waiting transfers as switch blockers', () => {
  assert.equal(hasActiveTransfers(snapshotWithStatus('queued')), true)
  assert.equal(hasActiveTransfers(snapshotWithStatus('running')), true)
  assert.equal(hasActiveTransfers(snapshotWithStatus('waitingCore')), true)
  assert.equal(hasActiveTransfers(snapshotWithStatus('completed')), false)
  assert.equal(hasActiveTransfers(snapshotWithStatus('failed')), false)
})
