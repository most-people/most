import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getFriendlyCoreError,
  getFriendlyRemoteConnectionError,
  getMostLinkErrorMessage,
  getTransferDisplayMessage,
  partitionTransfers,
  usesAccessibilityLayout,
} from './presentation'
import type { MobileTransfer } from '../mobileCore/types'
import { MOST_LINK_ERROR_CODES } from '../mobileCore/protocol'

test('usesAccessibilityLayout only for large accessibility scales', () => {
  assert.equal(usesAccessibilityLayout(1), false)
  assert.equal(usesAccessibilityLayout(1.59), false)
  assert.equal(usesAccessibilityLayout(1.6), true)
  assert.equal(usesAccessibilityLayout(3.1), true)
})

test('getFriendlyCoreError hides internal download failures', () => {
  assert.equal(
    getFriendlyCoreError(
      new Error('P2P core request timed out: file.download')
    ),
    '暂未发现在线种子，请稍后重试。'
  )
  assert.equal(
    getFriendlyCoreError(new Error('File content CID mismatch.')),
    '文件校验失败，内容与分享链接不一致。'
  )
  assert.equal(
    getFriendlyCoreError(new Error('Download cancelled')),
    '下载已取消。'
  )
  assert.equal(
    getFriendlyCoreError(new Error('unexpected internal failure')),
    '操作未完成，请稍后重试。'
  )
})

test('getMostLinkErrorMessage localizes protocol error codes', () => {
  assert.equal(
    getMostLinkErrorMessage(
      new Error(MOST_LINK_ERROR_CODES.unsupportedQuery),
      'en'
    ),
    'A share link only supports the filename parameter'
  )
  assert.equal(
    getMostLinkErrorMessage(
      new Error(MOST_LINK_ERROR_CODES.unsupportedPath),
      'zh-TW'
    ),
    'most:// 分享連結不能包含額外路徑'
  )
  assert.equal(
    getMostLinkErrorMessage(new Error('unexpected'), 'en'),
    'Enter a valid most:// link, web link, or CID'
  )
})

test('getFriendlyRemoteConnectionError localizes connection failures', () => {
  assert.equal(
    getFriendlyRemoteConnectionError(
      Object.assign(new Error('Forbidden'), { code: 'INVALID_INVITE' })
    ),
    '邀请码无效或远程访问未启用'
  )
  assert.equal(
    getFriendlyRemoteConnectionError(
      new Error('Finish or cancel active transfers before switching nodes'),
      'en'
    ),
    'Finish or cancel active transfers before switching nodes'
  )
})

test('getTransferDisplayMessage localizes stable core states', () => {
  assert.equal(getTransferDisplayMessage('Finding peers'), '正在查找在线种子')
  assert.equal(
    getTransferDisplayMessage('Downloaded to /private/data/example.pdf'),
    '下载完成，正在做种'
  )
  assert.equal(
    getTransferDisplayMessage('unexpected internal failure', 'failed'),
    '操作未完成，请稍后重试。'
  )
  assert.equal(
    getTransferDisplayMessage(
      'Downloaded and seeding on remote node',
      'completed',
      'zh-CN'
    ),
    '下载完成，远程节点正在做种'
  )
})

test('partitionTransfers separates current work from history', () => {
  const transfers = [
    createTransfer('running', 'active'),
    createTransfer('completed', 'completed'),
    createTransfer('failed', 'failed'),
  ]

  const result = partitionTransfers(transfers)
  assert.deepEqual(
    result.active.map(transfer => transfer.id),
    ['active']
  )
  assert.deepEqual(
    result.failed.map(transfer => transfer.id),
    ['failed']
  )
  assert.deepEqual(
    result.completed.map(transfer => transfer.id),
    ['completed']
  )
})

function createTransfer(
  status: MobileTransfer['status'],
  id: string
): MobileTransfer {
  return {
    id,
    kind: 'download',
    status,
    fileName: 'example.pdf',
    progress: status === 'completed' ? 100 : 10,
    message: 'Finding peers',
  }
}
