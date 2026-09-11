import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getTransferActions,
  getTransferQueueSummary,
  getTransferRuntimePolicy,
  getTransferRuntimeStatus,
} from './transferModel'
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

test('transfer queue summary counts active work and clamps aggregate progress', () => {
  const transfers = [
    transfer('running'),
    { ...transfer('queued'), progress: 150 },
    { ...transfer('waitingCore'), progress: -10 },
    { ...transfer('completed'), progress: 20 },
    { ...transfer('failed'), progress: 40 },
  ]

  assert.deepEqual(getTransferQueueSummary(transfers), {
    total: 5,
    active: 3,
    completed: 1,
    failed: 1,
    progress: 50,
  })
})

test('empty transfer queues report zero progress', () => {
  assert.deepEqual(getTransferQueueSummary([]), {
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    progress: 0,
  })
})

test('remote daemon transfers can continue while the app is backgrounded', () => {
  const policy = getTransferRuntimePolicy({
    platform: 'ios',
    backgroundSeedingEnabled: false,
    hasNativeForegroundService: false,
    nodeMode: 'remote',
  })

  assert.deepEqual(policy, {
    canContinueInBackground: true,
    requiresForegroundService: false,
    transport: 'remote-daemon',
  })
  assert.equal(
    getTransferRuntimeStatus([transfer('running')], 'background', policy),
    'background-running'
  )
})

test('local mobile transfers wait for resume until a native background service exists', () => {
  const policy = getTransferRuntimePolicy({
    platform: 'android',
    backgroundSeedingEnabled: true,
    hasNativeForegroundService: false,
    nodeMode: 'local',
  })

  assert.equal(policy.canContinueInBackground, false)
  assert.equal(policy.transport, 'foreground-only')
  assert.equal(
    getTransferRuntimeStatus([transfer('queued')], 'background', policy),
    'background-waiting'
  )
  assert.equal(getTransferRuntimeStatus([], 'background', policy), 'idle')
})

test('android foreground service is opt-in and explicit', () => {
  const policy = getTransferRuntimePolicy({
    platform: 'android',
    backgroundSeedingEnabled: true,
    hasNativeForegroundService: true,
    nodeMode: 'local',
  })

  assert.deepEqual(policy, {
    canContinueInBackground: true,
    requiresForegroundService: true,
    transport: 'android-foreground-service',
  })
})
