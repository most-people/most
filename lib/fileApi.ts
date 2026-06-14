import {
  api,
  getApiErrorPayload,
  getApiUrl,
} from '~/server/src/utils/api'
import {
  getDownloadCheckErrorMessageFromPayload,
} from '~/server/src/utils/downloadMessages.js'

export interface MostFileRecord {
  cid: string
  fileName: string
  link?: string
  size?: number
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
  size: number | null
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
  fileName?: string
  alreadyExists?: boolean
  [key: string]: unknown
}

export interface CheckDownloadOptions {
  timeout?: number
  requestTimeout?: number
}

async function publishFile(file: File, customName?: string) {
  const formData = new FormData()
  formData.append('file', file, customName || file.name)
  const res = await api.post('/api/publish', { body: formData })
  if (!res.ok) {
    const err = await res
      .json<{ error: string }>()
      .catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json<FilePublishResult>()
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
  listTrashFiles: () => api.get('/api/trash').json<MostFileRecord[]>(),
  deletePublishedFile: (cid: string) => api.delete(`/api/files/${cid}`).json(),
  restoreTrashFile: (cid: string) => api.post(`/api/trash/${cid}/restore`).json(),
  permanentDeleteTrashFile: (cid: string) =>
    api.delete(`/api/trash/${cid}`).json(),
  emptyTrash: () => api.delete('/api/trash').json(),
  toggleStar: (cid: string) =>
    api.post<ToggleStarResponse>(`/api/files/${cid}/star`).json(),
  getConfig: () => api.get('/api/config').json<Record<string, unknown>>(),
  getDataPath: () => api.get<DataPathResponse>('/api/config/data-path').json(),
  getNetworkAddresses: () => api.get<NetworkResponse>('/api/network').json(),
  saveConfig: (config: Record<string, unknown>) =>
    api
      .post('/api/config', {
        json: config,
      })
      .json(),
  publishFile,
  checkDownload: (link: string, options: CheckDownloadOptions = {}) => {
    const json =
      typeof options.timeout === 'number' ? { link, timeout: options.timeout } : { link }
    return api
      .post('/api/download/check', {
        json,
        timeout: options.requestTimeout ?? 15000,
      })
      .json<DownloadCheckResponse>()
  },
  downloadFile: (link: string) =>
    api.post('/api/download', { json: { link } }).json<DownloadFileResult>(),
  cacheFile: (cid: string) => api.post(`/api/files/${cid}/cache`).json(),
  cancelDownload: (taskId: string) =>
    api.post('/api/download/cancel', { json: { taskId } }).json(),
  getFileDownloadUrl: (cid: string) => getApiUrl(`/api/files/${cid}/download`),
  moveFile: (cid: string, newFileName: string) =>
    api.post('/api/move', { json: { cid, newFileName } }).json(),
  renameFolder: (oldPath: string, newPath: string) =>
    api.post('/api/folder/rename', { json: { oldPath, newPath } }).json(),
}

export { getDownloadCheckErrorMessage }
