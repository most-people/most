import { buildMostLink } from '../mobileCore/protocol'
import type {
  MobileHolding,
  MobileTransfer,
  TransferStatus,
} from '../mobileCore/types'

export type JsonRecord = Record<string, unknown>

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

export function readString(value: JsonRecord, key: string) {
  return typeof value[key] === 'string' ? String(value[key]) : ''
}

export function readNumber(value: JsonRecord, key: string) {
  const number = Number(value[key])
  return Number.isFinite(number) ? number : 0
}

export function normalizeRemoteTransferStatus(status: string): TransferStatus {
  if (status === 'starting') return 'queued'
  if (
    status === 'connecting' ||
    status === 'finding-peers' ||
    status === 'downloading' ||
    status === 'verifying' ||
    status === 'cancelling'
  ) {
    return 'running'
  }
  return 'running'
}

function getRemoteTransferMessage(status: string, fallback: string) {
  const messages: Record<string, string> = {
    starting: 'Starting remote download',
    connecting: 'Connecting to CID topic',
    'finding-peers': 'Finding peers',
    downloading: 'Downloading file',
    verifying: 'Verifying CID',
    cancelling: 'Cancelling remote download',
  }
  return messages[status] || fallback
}

export function normalizeRemoteHolding(value: unknown): MobileHolding | null {
  const record = asRecord(value)
  const cid = readString(record, 'cid')
  const fileName = readString(record, 'fileName')
  if (!cid || !fileName) return null
  const seedStatus = readString(record, 'seedStatus')
  const kind =
    readString(record, 'kind') === 'collection' ? 'collection' : 'file'
  return {
    cid,
    fileName,
    kind,
    ...(kind === 'collection'
      ? {
          fileCount: readNumber(record, 'fileCount'),
        }
      : {}),
    size: readNumber(record, 'size') || readNumber(record, 'holdingSize'),
    status:
      seedStatus === 'queued' ||
      seedStatus === 'joining' ||
      seedStatus === 'active' ||
      seedStatus === 'paused' ||
      seedStatus === 'error'
        ? seedStatus
        : 'queued',
    topicJoined: record.joined === true,
    peerCount: readNumber(record, 'peerCount'),
    source:
      readString(record, 'source') === 'downloaded'
        ? 'downloaded'
        : 'published',
    shareLink: readString(record, 'link') || buildMostLink(cid, fileName),
    ...(typeof record.localAvailable === 'boolean'
      ? { localAvailable: record.localAvailable }
      : {}),
  }
}

export function normalizeRemoteDownloadTask(
  value: unknown
): MobileTransfer | null {
  const record = asRecord(value)
  const id = readString(record, 'taskId')
  if (!id) return null
  return {
    id,
    kind: 'download',
    status: normalizeRemoteTransferStatus(readString(record, 'status')),
    fileName: readString(record, 'fileName') || readString(record, 'cid'),
    cid: readString(record, 'cid') || undefined,
    progress: readNumber(record, 'progress'),
    message: getRemoteTransferMessage(
      readString(record, 'status'),
      'Downloading file'
    ),
  }
}

export function applyRemoteDownloadEvent(
  transfer: MobileTransfer,
  event: string,
  data: JsonRecord
) {
  const next = { ...transfer }
  if (event === 'download:status' || event === 'download:progress') {
    const status = readString(data, 'status')
    next.status = 'running'
    next.message = getRemoteTransferMessage(status, next.message)
    if (typeof data.percent === 'number') next.progress = data.percent
    return next
  }
  if (event === 'download:success') {
    next.status = 'completed'
    next.progress = 100
    next.message = 'Downloaded and seeding on remote node'
    return next
  }
  if (event === 'download:error' || event === 'download:cancelled') {
    next.status = 'failed'
    next.message = readString(data, 'error') || 'Download cancelled'
  }
  return next
}
