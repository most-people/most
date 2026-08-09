import type { MobileTransfer } from '../mobileCore/types'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import type { MessageKey } from '../i18n/messages'
import { translateMessage } from '../i18n/translate'

const TRANSFER_MESSAGE_KEYS: Record<string, MessageKey> = {
  'Calculating UnixFS CID': 'core.transfer.calculatingCid',
  'Writing file into Hyperdrive': 'core.transfer.writingDrive',
  'Published and seeding': 'core.transfer.publishedSeeding',
  'Connecting to CID topic': 'core.transfer.connecting',
  'Already available in local holdings': 'core.transfer.localAvailable',
  'Finding peers': 'core.transfer.findingPeers',
  'Downloading file': 'core.transfer.downloading',
  'Verifying CID': 'core.transfer.verifying',
}

export function usesAccessibilityLayout(fontScale: number) {
  return Number.isFinite(fontScale) && fontScale >= 1.6
}

export function getFriendlyCoreError(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE
) {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()

  if (
    normalized.includes('no online seed') ||
    (normalized.includes('timed out') && normalized.includes('file.download'))
  ) {
    return translateMessage('core.error.seedUnavailable', locale)
  }
  if (normalized.includes('download cancelled')) {
    return translateMessage('core.error.downloadCancelled', locale)
  }
  if (normalized.includes('cid mismatch')) {
    return translateMessage('core.error.cidMismatch', locale)
  }
  if (
    normalized.includes('core is not running') ||
    normalized.includes('core is not ready') ||
    normalized.includes('core stopped')
  ) {
    return translateMessage('core.error.notReady', locale)
  }
  if (
    normalized.includes('network') ||
    normalized.includes('connection') ||
    normalized.includes('socket')
  ) {
    return translateMessage('core.error.network', locale)
  }
  return translateMessage('core.error.generic', locale)
}

export function getTransferDisplayMessage(
  message: string,
  status?: MobileTransfer['status'],
  locale: Locale = DEFAULT_LOCALE
) {
  const messageKey = TRANSFER_MESSAGE_KEYS[message]
  if (messageKey) return translateMessage(messageKey, locale)
  if (message.startsWith('Downloaded to ')) {
    return translateMessage('core.transfer.downloadedSeeding', locale)
  }
  if (message.startsWith('P2P core request timed out:')) {
    return getFriendlyCoreError(new Error(message), locale)
  }
  if (message === 'No online seed was found for this CID') {
    return getFriendlyCoreError(new Error(message), locale)
  }
  if (message.includes('CID mismatch')) {
    return getFriendlyCoreError(new Error(message), locale)
  }
  if (status === 'failed') {
    return getFriendlyCoreError(new Error(message), locale)
  }
  return message
}

export function partitionTransfers(transfers: MobileTransfer[]) {
  const active: MobileTransfer[] = []
  const failed: MobileTransfer[] = []
  const completed: MobileTransfer[] = []

  for (const transfer of transfers) {
    if (
      transfer.status === 'queued' ||
      transfer.status === 'running' ||
      transfer.status === 'waitingCore'
    ) {
      active.push(transfer)
    } else if (transfer.status === 'failed') failed.push(transfer)
    else completed.push(transfer)
  }

  return { active, failed, completed }
}
