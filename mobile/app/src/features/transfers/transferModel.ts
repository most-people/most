import type { MobileTransfer } from '../../mobileCore/types'

export type TransferQueueSummary = {
  total: number
  active: number
  completed: number
  failed: number
  progress: number
}

const ACTIVE_TRANSFER_STATUSES = new Set<MobileTransfer['status']>([
  'queued',
  'running',
  'waitingCore',
])

/**
 * Returns a stable queue summary for the transfers screen.
 * Progress includes completed work (100%) and failed work (its last known
 * progress), so the value remains useful while a mixed queue is visible.
 */
export function getTransferQueueSummary(
  transfers: MobileTransfer[]
): TransferQueueSummary {
  let active = 0
  let completed = 0
  let failed = 0
  let progressTotal = 0

  for (const transfer of transfers) {
    if (ACTIVE_TRANSFER_STATUSES.has(transfer.status)) active += 1
    if (transfer.status === 'completed') completed += 1
    if (transfer.status === 'failed') failed += 1
    const progress = Number.isFinite(transfer.progress)
      ? Math.max(0, Math.min(100, transfer.progress))
      : 0
    progressTotal += transfer.status === 'completed' ? 100 : progress
  }

  return {
    total: transfers.length,
    active,
    completed,
    failed,
    progress: transfers.length
      ? Math.round(progressTotal / transfers.length)
      : 0,
  }
}

export function getTransferActions(
  transfer: MobileTransfer,
  hasHolding: boolean
) {
  return {
    canCancel:
      transfer.kind === 'download' &&
      Boolean(transfer.cid) &&
      ['queued', 'running', 'waitingCore'].includes(transfer.status),
    canOpen: transfer.status === 'completed' && hasHolding,
    canRetry: transfer.status === 'failed',
  }
}
