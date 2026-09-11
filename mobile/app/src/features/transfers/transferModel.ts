import type { MobileTransfer } from '../../mobileCore/types'

export type TransferRuntimePlatform =
  'android' | 'ios' | 'web' | 'windows' | 'macos' | 'unknown'

export type TransferRuntimePolicy = {
  canContinueInBackground: boolean
  requiresForegroundService: boolean
  transport:
    | 'remote-daemon'
    | 'android-foreground-service'
    | 'ios-background-task'
    | 'foreground-only'
}

export type TransferRuntimeStatus =
  'active' | 'background-running' | 'background-waiting' | 'idle'

/**
 * Describes the background contract without claiming that Expo keeps a local
 * Bare Worklet alive. A remote daemon can continue independently; a local
 * node needs a native background service/task before this is enabled.
 */
export function getTransferRuntimePolicy(input: {
  platform: TransferRuntimePlatform
  backgroundSeedingEnabled: boolean
  hasNativeForegroundService: boolean
  nodeMode?: 'local' | 'remote'
}): TransferRuntimePolicy {
  if (input.nodeMode === 'remote') {
    return {
      canContinueInBackground: true,
      requiresForegroundService: false,
      transport: 'remote-daemon',
    }
  }

  if (
    input.platform === 'android' &&
    input.backgroundSeedingEnabled &&
    input.hasNativeForegroundService
  ) {
    return {
      canContinueInBackground: true,
      requiresForegroundService: true,
      transport: 'android-foreground-service',
    }
  }

  if (
    input.platform === 'ios' &&
    input.backgroundSeedingEnabled &&
    input.hasNativeForegroundService
  ) {
    return {
      canContinueInBackground: true,
      requiresForegroundService: false,
      transport: 'ios-background-task',
    }
  }

  return {
    canContinueInBackground: false,
    requiresForegroundService: false,
    transport: 'foreground-only',
  }
}

export function getTransferRuntimeStatus(
  transfers: MobileTransfer[],
  appState: 'active' | 'background' | 'inactive',
  policy: TransferRuntimePolicy
): TransferRuntimeStatus {
  const hasActiveTransfers = transfers.some(transfer =>
    ACTIVE_TRANSFER_STATUSES.has(transfer.status)
  )
  if (!hasActiveTransfers) return 'idle'
  if (appState === 'active') return 'active'
  return policy.canContinueInBackground
    ? 'background-running'
    : 'background-waiting'
}

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
