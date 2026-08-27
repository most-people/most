import type { MobileTransfer } from '../../mobileCore/types'

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
