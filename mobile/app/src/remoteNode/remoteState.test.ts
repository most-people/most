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
      size: 42,
      source: 'downloaded',
      seedStatus: 'active',
      joined: true,
      peerCount: 3,
    }),
    {
      cid: CID,
      fileName: 'report.txt',
      size: 42,
      source: 'downloaded',
      status: 'active',
      topicJoined: true,
      peerCount: 3,
      shareLink: `most://${CID}?filename=report.txt`,
    }
  )
})

test('ignores directory collections and maps active remote downloads', () => {
  assert.equal(
    normalizeRemoteHolding({
      cid: CID,
      fileName: 'folder',
      kind: 'collection',
    }),
    null
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
