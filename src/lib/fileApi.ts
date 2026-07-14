import {
  api,
  getApiErrorMessage,
  getApiErrorPayload,
  getApiUrl,
} from '~server/src/utils/api'
import { getDownloadCheckErrorMessageFromPayload } from '~server/src/utils/downloadMessages.js'
import {
  getPublishFileLimitViolation,
  getPublishFileTooLargeMessageFromPayload,
  type NodePolicy,
} from '~/lib/publishLimits'
import type { MessageKey } from '~/lib/i18n'

export interface MostFileRecord {
  cid: string
  fileName: string
  kind?: 'file' | 'collection'
  link?: string
  size?: number
  fileCount?: number
  starred?: boolean
  localAvailable?: boolean
  alreadyExists?: boolean
  [key: string]: unknown
}

export interface DataPathResponse {
  dataPath: string
  isDefault: boolean
}

export interface NetworkAddress {
  type: string
  ip: string
  label: string
  iface: string
}

export interface NetworkResponse {
  port: number
  addresses: NetworkAddress[]
}

export interface ToggleStarResponse {
  success: boolean
  cid: string
  starred: boolean
}

export interface DownloadCheckResponse {
  success: boolean
  available: boolean
  cid: string
  fileName: string
  kind?: 'file' | 'collection'
  availabilityScope?: 'collection-manifest'
  size: number | null
  fileCount?: number
  files?: CollectionFileRecord[]
  localAvailableCount?: number
  missingLocalCount?: number
  localAvailable?: boolean
  alreadyExists?: boolean
}

export interface FilePublishResult extends MostFileRecord {
  cid: string
  fileName: string
  link: string
}

export interface DownloadFileResult {
  success?: boolean
  taskId?: string
  kind?: 'file' | 'collection'
  fileName?: string
  files?: CollectionFileRecord[]
  localAvailable?: boolean
  alreadyExists?: boolean
  [key: string]: unknown
}

export interface CollectionFileRecord {
  path: string
  cid: string
  size: number
  localAvailable?: boolean
  seedStatus?: string
  seedError?: string
}

export interface CheckDownloadOptions {
  timeout?: number
  requestTimeout?: number
}

const DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS = 10000
const DOWNLOAD_CHECK_REQUEST_GRACE_MS = 5000

type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string

async function publishFile(file: File, customName?: string) {
  const formData = new FormData()
  formData.append('file', file, customName || file.name)
  const res = await api.post('/api/publish', {
    body: formData,
    timeout: false,
    throwHttpErrors: false,
  })
  if (!res.ok) {
    const data = (await res
      .clone()
      .json()
      .catch(() => ({ error: res.statusText }))) as { error?: string }
    const err = new Error(data.error || 'Request failed') as Error & {
      response?: Response
    }
    err.response = res
    throw err
  }
  return res.json<FilePublishResult>()
}

async function getPublishFileErrorMessage(
  err: unknown,
  fallback: string,
  t: Translate,
  fileName = ''
) {
  const data = await getApiErrorPayload(err)
  const sizeMessage = getPublishFileTooLargeMessageFromPayload(
    data,
    t,
    fileName
  )
  if (sizeMessage) return sizeMessage

  return getApiErrorMessage(err, fallback)
}

async function getDownloadCheckErrorMessage(err: unknown) {
  const data = await getApiErrorPayload(err)
  const errorName =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: string }).name)
      : ''
  return getDownloadCheckErrorMessageFromPayload(data, errorName)
}

export const fileApi = {
  listPublishedFiles: () => api.get('/api/files').json<MostFileRecord[]>(),
  deletePublishedFile: (cid: string) => api.delete(`/api/files/${cid}`).json(),
  toggleStar: (cid: string) =>
    api.post<ToggleStarResponse>(`/api/files/${cid}/star`).json(),
  getConfig: () => api.get('/api/config').json<Record<string, unknown>>(),
  getDataPath: () => api.get<DataPathResponse>('/api/config/data-path').json(),
  getNetworkAddresses: () => api.get<NetworkResponse>('/api/network').json(),
  getNodePolicy: () => api.get<NodePolicy>('/api/node/policy').json(),
  saveConfig: (config: Record<string, unknown>) =>
    api
      .post('/api/config', {
        json: config,
      })
      .json(),
  publishFile,
  shareFolder: (path: string) =>
    api
      .post('/api/folder/share', {
        json: { path },
      })
      .json<FilePublishResult>(),
  getCollection: (cid: string) =>
    api.get(`/api/collections/${cid}`).json<
      MostFileRecord & {
        files: CollectionFileRecord[]
      }
    >(),
  checkDownload: (link: string, options: CheckDownloadOptions = {}) => {
    const timeout =
      typeof options.timeout === 'number'
        ? options.timeout
        : DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS
    return api
      .post('/api/download/check', {
        json: { link, timeout },
        timeout:
          options.requestTimeout ?? timeout + DOWNLOAD_CHECK_REQUEST_GRACE_MS,
      })
      .json<DownloadCheckResponse>()
  },
  downloadFile: (link: string, selectedPaths?: string[]) =>
    api
      .post('/api/download', {
        json: selectedPaths?.length ? { link, selectedPaths } : { link },
      })
      .json<DownloadFileResult>(),
  cancelDownload: (taskId: string) =>
    api.post('/api/download/cancel', { json: { taskId } }).json(),
  getFileDownloadUrl: (cid: string) => getApiUrl(`/api/files/${cid}/download`),
  moveFile: (cid: string, newFileName: string) =>
    api.post('/api/move', { json: { cid, newFileName } }).json(),
  renameFolder: (oldPath: string, newPath: string) =>
    api.post('/api/folder/rename', { json: { oldPath, newPath } }).json(),
}

export {
  getDownloadCheckErrorMessage,
  getPublishFileErrorMessage,
  getPublishFileLimitViolation,
}
