import assert from 'node:assert/strict'
import test from 'node:test'
import { getTransferActions } from './transferModel'
import type { MobileTransfer } from '../../mobileCore/types'

function transfer(
  status: MobileTransfer['status'],
  kind: MobileTransfer['kind'] = 'download'
): MobileTransfer {
  return {
    cid: 'bafy-test',
    fileName: 'example.pdf',
    id: `${kind}-${status}`,
    kind,
    message: '',
    progress: 10,
    status,
  }
}

test('download actions expose cancel, retry, and open only in valid states', () => {
  assert.deepEqual(getTransferActions(transfer('running'), false), {
    canCancel: true,
    canOpen: false,
    canRetry: false,
  })
  assert.deepEqual(getTransferActions(transfer('failed'), false), {
    canCancel: false,
    canOpen: false,
    canRetry: true,
  })
  assert.deepEqual(getTransferActions(transfer('completed'), true), {
    canCancel: false,
    canOpen: true,
    canRetry: false,
  })
})

test('publish transfers cannot use download cancellation', () => {
  assert.equal(
    getTransferActions(transfer('running', 'publish'), false).canCancel,
    false
  )
})
