import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyRemoteDownloadEvent,
  normalizeRemoteDownloadTask,
  normalizeRemoteHolding,
} from './remoteState'
import type { MobileTransfer } from '../mobileCore/types'

const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

test('maps remote single-file state into the mobile holding model', () => {
  assert.deepEqual(
    normalizeRemoteHolding({
      cid: CID,
      fileName: 'report.txt',
      kind: 'file',
      size: 42,
      source: 'downloaded',
      seedStatus: 'active',
      joined: true,
      peerCount: 3,
      localAvailable: true,
    }),
    {
      cid: CID,
      fileName: 'report.txt',
      kind: 'file',
      size: 42,
      source: 'downloaded',
      status: 'active',
      topicJoined: true,
      peerCount: 3,
      shareLink: `most://${CID}?filename=report.txt`,
      localAvailable: true,
    }
  )
})

test('preserves missing local content state for remote library files', () => {
  assert.equal(
    normalizeRemoteHolding({
      cid: CID,
      fileName: 'report.txt',
      localAvailable: false,
    })?.localAvailable,
    false
  )
})

test('maps directory collections and active remote downloads', () => {
  assert.deepEqual(
    normalizeRemoteHolding({
      cid: CID,
      fileName: 'folder',
      kind: 'collection',
      fileCount: 3,
      size: 64,
      localAvailable: false,
    }),
    {
      cid: CID,
      fileCount: 3,
      fileName: 'folder',
      kind: 'collection',
      localAvailable: false,
      peerCount: 0,
      shareLink: `most://${CID}?filename=folder`,
      size: 64,
      source: 'published',
      status: 'queued',
      topicJoined: false,
    }
  )
  assert.deepEqual(
    normalizeRemoteDownloadTask({
      taskId: 'dl_1',
      cid: CID,
      fileName: 'report.txt',
      status: 'verifying',
      progress: 95,
    }),
    {
      id: 'dl_1',
      kind: 'download',
      status: 'running',
      fileName: 'report.txt',
      cid: CID,
      progress: 95,
      message: 'Verifying CID',
    }
  )
})

test('maps WebSocket progress and terminal download events', () => {
  const transfer: MobileTransfer = {
    id: 'dl_1',
    kind: 'download',
    status: 'queued',
    fileName: 'report.txt',
    progress: 0,
    message: 'Starting',
  }
  const running = applyRemoteDownloadEvent(transfer, 'download:progress', {
    status: 'downloading',
    percent: 64,
  })
  assert.equal(running.status, 'running')
  assert.equal(running.progress, 64)
  assert.equal(running.message, 'Downloading file')

  const completed = applyRemoteDownloadEvent(running, 'download:success', {})
  assert.equal(completed.status, 'completed')
  assert.equal(completed.progress, 100)

  const failed = applyRemoteDownloadEvent(transfer, 'download:error', {
    error: 'No online seed',
  })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.message, 'No online seed')

  const cancelled = applyRemoteDownloadEvent(transfer, 'download:cancelled', {})
  assert.equal(cancelled.status, 'failed')
  assert.equal(cancelled.message, 'Download cancelled')
})
