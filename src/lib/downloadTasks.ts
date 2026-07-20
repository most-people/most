export type ActiveDownloadStatus =
  | 'starting'
  | 'connecting'
  | 'finding-peers'
  | 'downloading'
  | 'verifying'
  | 'cancelling'

export type DownloadOutcomeStatus =
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'

export interface ActiveDownloadTask {
  taskId: string
  cid: string
  fileName: string
  kind: 'file' | 'collection'
  status: ActiveDownloadStatus
  progress: number
  loadedBytes: number
  totalBytes: number
  completedFiles: number
  totalFiles: number
  startedAt: number
  updatedAt: number
}

export interface DownloadErrorDetails {
  kind?: string
  collectionName?: string
  childCid?: string
  childPath?: string
  fileName?: string
}

export interface DownloadEventPayload {
  taskId?: string
  status?: string
  kind?: string
  code?: string
  errorCode?: string
  collection?: boolean
  partial?: boolean
  percent?: number
  loaded?: number
  total?: number
  fileCount?: number
  selectedFileCount?: number
  downloadedFileCount?: number
  unavailableFileCount?: number
  processedFiles?: number
  completedFiles?: number
  totalFiles?: number
  file?: string
  fileName?: string
  error?: string
  downloadedPaths?: string[]
  unavailablePaths?: string[]
  details?: DownloadErrorDetails
}

export interface DownloadTaskOutcome {
  taskId: string
  cid: string
  fileName: string
  kind: 'file' | 'collection'
  status: DownloadOutcomeStatus
  payload: DownloadEventPayload
  finishedAt: number
}

export interface ParsedDownloadEvent {
  event: string
  payload: DownloadEventPayload
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function readDownloadEventPaths(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map(item =>
      item && typeof item === 'object'
        ? readString(item as Record<string, unknown>, 'path')
        : undefined
    )
    .filter((path): path is string => Boolean(path))
}

function readDownloadErrorDetails(
  value: unknown
): DownloadErrorDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  return {
    kind: readString(record, 'kind'),
    collectionName: readString(record, 'collectionName'),
    childCid: readString(record, 'childCid'),
    childPath: readString(record, 'childPath'),
    fileName: readString(record, 'fileName'),
  }
}

export function normalizeDownloadErrorPayload(
  value: unknown
): DownloadEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const record = value as Record<string, unknown>
  return {
    code: readString(record, 'code'),
    errorCode: readString(record, 'errorCode'),
    error: readString(record, 'error'),
    details: readDownloadErrorDetails(record.details),
  }
}

export function parseDownloadEvent(raw: string): ParsedDownloadEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const root = parsed as Record<string, unknown>
  const event = readString(root, 'event')
  const data = root.data
  if (!event || !data || typeof data !== 'object') return null

  const payloadRecord = data as Record<string, unknown>
  return {
    event,
    payload: {
      taskId: readString(payloadRecord, 'taskId'),
      status: readString(payloadRecord, 'status'),
      kind: readString(payloadRecord, 'kind'),
      code: readString(payloadRecord, 'code'),
      errorCode: readString(payloadRecord, 'errorCode'),
      collection: readBoolean(payloadRecord, 'collection'),
      partial: readBoolean(payloadRecord, 'partial'),
      percent: readNumber(payloadRecord, 'percent'),
      loaded: readNumber(payloadRecord, 'loaded'),
      total: readNumber(payloadRecord, 'total'),
      fileCount: readNumber(payloadRecord, 'fileCount'),
      selectedFileCount: readNumber(payloadRecord, 'selectedFileCount'),
      downloadedFileCount: readNumber(payloadRecord, 'downloadedFileCount'),
      unavailableFileCount: readNumber(payloadRecord, 'unavailableFileCount'),
      processedFiles: readNumber(payloadRecord, 'processedFiles'),
      completedFiles: readNumber(payloadRecord, 'completedFiles'),
      totalFiles: readNumber(payloadRecord, 'totalFiles'),
      file: readString(payloadRecord, 'file'),
      fileName: readString(payloadRecord, 'fileName'),
      error: readString(payloadRecord, 'error'),
      downloadedPaths: readDownloadEventPaths(payloadRecord.files),
      unavailablePaths: readDownloadEventPaths(payloadRecord.unavailableFiles),
      details: readDownloadErrorDetails(payloadRecord.details),
    },
  }
}
