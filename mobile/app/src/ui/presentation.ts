import type { MobileTransfer } from '../mobileCore/types'
import { MOST_LINK_ERROR_CODES } from '../mobileCore/protocol'
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
  'Uploading to remote node': 'core.transfer.remoteUploading',
  'Published and seeding on remote node':
    'core.transfer.remotePublishedSeeding',
  'Starting remote download': 'core.transfer.remoteStartingDownload',
  'Downloaded and seeding on remote node':
    'core.transfer.remoteDownloadedSeeding',
  'Cancelling remote download': 'core.transfer.remoteCancelling',
}

const MOST_LINK_MESSAGE_KEYS: Record<string, MessageKey> = {
  [MOST_LINK_ERROR_CODES.linkEmpty]: 'app.link.empty',
  [MOST_LINK_ERROR_CODES.invalidUrl]: 'app.link.invalid',
  [MOST_LINK_ERROR_CODES.invalidProtocol]: 'app.link.invalid',
  [MOST_LINK_ERROR_CODES.unsupportedPath]: 'app.link.unsupportedPath',
  [MOST_LINK_ERROR_CODES.unsupportedQuery]: 'app.link.unsupportedQuery',
  [MOST_LINK_ERROR_CODES.invalidCid]: 'app.link.invalid',
  [MOST_LINK_ERROR_CODES.cidV1Required]: 'app.link.invalid',
  [MOST_LINK_ERROR_CODES.cidDigestLength]: 'app.link.invalid',
}

export function usesAccessibilityLayout(fontScale: number) {
  return Number.isFinite(fontScale) && fontScale >= 1.6
}

export function getMostLinkErrorMessage(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE
) {
  const code = error instanceof Error ? error.message : ''
  return translateMessage(
    MOST_LINK_MESSAGE_KEYS[code] || 'app.link.invalid',
    locale
  )
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

export function getFriendlyRemoteConnectionError(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE
) {
  const message = error instanceof Error ? error.message : String(error || '')
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code || '')
      : ''
  const normalized = message.toLowerCase()

  let key: MessageKey = 'node.connection.error.generic'
  if (
    code === 'WEB_REMOTE_REQUIRED' ||
    normalized.includes('web app requires a connection')
  ) {
    key = 'node.connection.error.required'
  } else if (normalized.includes('valid http or https')) {
    key = 'node.connection.error.invalidUrl'
  } else if (code === 'INVALID_INVITE' || normalized.includes('invite')) {
    key = 'node.connection.error.invalidInvite'
  } else if (
    code === 'REMOTE_LOGIN_REQUIRED' ||
    code === 'UNAUTHORIZED' ||
    normalized.includes('signed identity')
  ) {
    key = 'node.connection.error.identity'
  } else if (normalized.includes('active transfers')) {
    key = 'node.connection.error.switchBlocked'
  } else if (
    code.startsWith('REMOTE_') ||
    normalized.includes('connection') ||
    normalized.includes('unreachable') ||
    normalized.includes('reconnecting')
  ) {
    key = 'node.connection.error.unreachable'
  }
  return translateMessage(key, locale)
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
