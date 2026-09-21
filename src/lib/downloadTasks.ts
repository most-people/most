/**
 * Web-side download task model.
 *
 * The `download:*` payload parser is shared with the mobile client through
 * `@most-box/protocol`, so the field names and runtime types are defined once.
 * This module keeps the web-only types and the terminal-task filter.
 */
export {
  normalizeDownloadErrorPayload,
  parseDownloadEvent,
} from '@most-box/protocol/download-event'

export type ActiveDownloadStatus =
  | 'starting'
  | 'connecting'
  | 'finding-peers'
  | 'downloading'
  | 'verifying'
  | 'cancelling'

export type DownloadOutcomeStatus =
  'completed' | 'partial' | 'failed' | 'cancelled'

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
  stage?: string
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

export function excludeTerminalDownloadTasks(
  tasks: ActiveDownloadTask[],
  outcomes: DownloadTaskOutcome[]
) {
  const terminalTaskIds = new Set(outcomes.map(outcome => outcome.taskId))
  return tasks.filter(task => !terminalTaskIds.has(task.taskId))
}
