/**
 * Canonical `download:*` WebSocket event parser.
 *
 * The daemon emits these over `/ws` and every client page (file library, chat
 * attachments, download tray, admin log, and the mobile remote-node client)
 * consumes the same payloads. This module is the single parser so the field
 * names and their runtime types cannot drift per page.
 *
 * Runtime-agnostic on purpose: no `node:` imports and no `Buffer`.
 *
 * @typedef {'starting'|'connecting'|'finding-peers'|'downloading'|'verifying'|'cancelling'} ActiveDownloadStatus
 * @typedef {'completed'|'partial'|'failed'|'cancelled'} DownloadOutcomeStatus
 *
 * @typedef {object} DownloadErrorDetails
 * @property {string} [kind]
 * @property {string} [collectionName]
 * @property {string} [childCid]
 * @property {string} [childPath]
 * @property {string} [fileName]
 *
 * @typedef {object} DownloadEventPayload
 * @property {string} [taskId]
 * @property {string} [status]
 * @property {string} [kind]
 * @property {string} [code]
 * @property {string} [errorCode]
 * @property {boolean} [collection]
 * @property {boolean} [partial]
 * @property {number} [percent]
 * @property {number} [loaded]
 * @property {number} [total]
 * @property {number} [fileCount]
 * @property {number} [selectedFileCount]
 * @property {number} [downloadedFileCount]
 * @property {number} [unavailableFileCount]
 * @property {number} [processedFiles]
 * @property {number} [completedFiles]
 * @property {number} [totalFiles]
 * @property {string} [file]
 * @property {string} [fileName]
 * @property {string} [stage]
 * @property {string} [error]
 * @property {string[]} [downloadedPaths]
 * @property {string[]} [unavailablePaths]
 * @property {DownloadErrorDetails} [details]
 *
 * @typedef {object} ParsedDownloadEvent
 * @property {string} event
 * @property {DownloadEventPayload} payload
 */

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 */
function readString(record, key) {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 */
function readNumber(record, key) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 */
function readBoolean(record, key) {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function readDownloadEventPaths(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item =>
      item && typeof item === 'object'
        ? readString(/** @type {Record<string, unknown>} */ (item), 'path')
        : undefined
    )
    .filter(path => Boolean(path))
}

/**
 * @param {unknown} value
 * @returns {DownloadErrorDetails | undefined}
 */
function readDownloadErrorDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = /** @type {Record<string, unknown>} */ (value)
  return {
    kind: readString(record, 'kind'),
    collectionName: readString(record, 'collectionName'),
    childCid: readString(record, 'childCid'),
    childPath: readString(record, 'childPath'),
    fileName: readString(record, 'fileName'),
  }
}

/**
 * Normalizes an error payload that did not arrive as a full envelope.
 *
 * @param {unknown} value
 * @returns {DownloadEventPayload}
 */
export function normalizeDownloadErrorPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const record = /** @type {Record<string, unknown>} */ (value)
  return {
    code: readString(record, 'code'),
    errorCode: readString(record, 'errorCode'),
    error: readString(record, 'error'),
    details: readDownloadErrorDetails(record.details),
  }
}

/**
 * Parses a raw `/ws` message into an event name and a type-checked payload.
 *
 * Returns `null` for malformed JSON, a missing event name, or a missing payload
 * object. Unknown event names are returned as-is: callers filter by name.
 *
 * @param {string} raw
 * @returns {ParsedDownloadEvent | null}
 */
export function parseDownloadEvent(raw) {
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const root = /** @type {Record<string, unknown>} */ (parsed)
  const event = readString(root, 'event')
  const data = root.data
  if (!event || !data || typeof data !== 'object') return null

  const payloadRecord = /** @type {Record<string, unknown>} */ (data)
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
      stage: readString(payloadRecord, 'stage'),
      error: readString(payloadRecord, 'error'),
      downloadedPaths: readDownloadEventPaths(payloadRecord.files),
      unavailablePaths: readDownloadEventPaths(payloadRecord.unavailableFiles),
      details: readDownloadErrorDetails(payloadRecord.details),
    },
  }
}
