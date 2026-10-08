import assert from 'node:assert/strict'
import test from 'node:test'
import { getAttachmentState, getMessageAttachment } from './attachmentModel'
import type { MobileHolding, MobileTransfer } from '../../mobileCore/types'

const CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
const link = `most://${CID}?filename=hello.txt`
const holding: MobileHolding = {
  cid: CID,
  fileName: 'hello.txt',
  size: 11,
  status: 'active',
  topicJoined: true,
  peerCount: 0,
  source: 'downloaded',
  shareLink: link,
  localAvailable: true,
}
const download: MobileTransfer = {
  id: 'download-1',
  kind: 'download',
  status: 'running',
  fileName: 'hello.txt',
  cid: CID,
  link,
  progress: 50,
  message: 'Downloading',
}

test('recognizes structured attachments and legacy most links', () => {
  const attachment = {
    kind: 'file' as const,
    cid: CID,
    fileName: 'hello.txt',
    link,
    size: 11,
  }
  assert.deepEqual(
    getMessageAttachment({ content: link, attachment }),
    attachment
  )
  assert.deepEqual(getMessageAttachment({ content: link }), {
    kind: 'file',
    cid: CID,
    fileName: 'hello.txt',
    link,
  })
  assert.equal(getMessageAttachment({ content: 'normal message' }), null)
  assert.equal(getMessageAttachment({ content: 'most://invalid' }), null)
})

test('opens only complete content identified by CID', () => {
  assert.equal(getAttachmentState(CID, [holding], []).status, 'available')
  assert.equal(
    getAttachmentState(CID, [{ ...holding, localAvailable: false }], []).status,
    'ready'
  )
  assert.equal(
    getAttachmentState(CID, [{ ...holding, cid: 'different-cid' }], []).status,
    'ready'
  )
})

test('shows active download progress and retries failures instead of duplicate downloads', () => {
  const failed = { ...download, status: 'failed' as const }
  const state = getAttachmentState(CID, [], [failed, download])
  assert.equal(state.status, 'running')
  assert.equal(state.transfer?.progress, 50)
  assert.equal(getAttachmentState(CID, [], [failed]).status, 'failed')
  assert.equal(
    getAttachmentState(CID, [], [{ ...download, kind: 'publish' }]).status,
    'ready'
  )
  assert.equal(
    getAttachmentState(CID, [], [{ ...download, status: 'completed' }]).status,
    'ready'
  )
})
