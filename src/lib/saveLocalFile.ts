type SaveFileWritable = {
  write: (data: Blob) => Promise<void> | void
  close: () => Promise<void> | void
}

type SaveFileHandle = {
  createWritable: () => Promise<SaveFileWritable>
}

type SaveFilePicker = (options: {
  suggestedName: string
}) => Promise<SaveFileHandle>

type FetchFile = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

type ObjectUrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

type DownloadDocument = Pick<Document, 'createElement'> & {
  body: Pick<Document['body'], 'appendChild' | 'removeChild'>
}

export type SaveFileToLocalResult = {
  method: 'picker' | 'download'
}

export type SaveFileToLocalOptions = {
  cid: string
  fileName: string
  getFileDownloadUrl: (cid: string) => string
  loadFailedMessage?: string
  getRequestHeaders?: (
    method: string,
    path: string
  ) => Promise<Record<string, string>>
  fetchFile?: FetchFile
  showSaveFilePicker?: SaveFilePicker | null
  documentRef?: DownloadDocument
  urlApi?: ObjectUrlApi
}

function getDefaultFetchFile(): FetchFile {
  if (typeof fetch !== 'function') {
    throw new Error('Browser fetch unavailable')
  }
  return fetch.bind(globalThis)
}

function getDefaultSaveFilePicker(): SaveFilePicker | null {
  const picker = (
    globalThis as unknown as { showSaveFilePicker?: SaveFilePicker }
  ).showSaveFilePicker
  return typeof picker === 'function' ? picker.bind(globalThis) : null
}

function getDefaultDocument(): DownloadDocument {
  const doc = (globalThis as unknown as { document?: Document }).document
  if (!doc?.body || typeof doc.createElement !== 'function') {
    throw new Error('Browser download unavailable')
  }
  return doc
}

function getLocalSaveFileName(fileName: string) {
  const normalized = String(fileName || '').replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || 'download'
}

async function fetchLocalFileBlob({
  cid,
  getFileDownloadUrl,
  loadFailedMessage,
  getRequestHeaders,
  fetchFile,
}: SaveFileToLocalOptions) {
  const requestPath = `/api/files/${cid}/download`
  const headers = getRequestHeaders
    ? await getRequestHeaders('GET', requestPath)
    : {}
  const res = await (fetchFile || getDefaultFetchFile())(
    getFileDownloadUrl(cid),
    { headers }
  )

  if (!res.ok) {
    throw new Error(loadFailedMessage || 'Failed to get file')
  }

  return res.blob()
}

async function saveWithPicker(
  picker: SaveFilePicker,
  fileName: string,
  blob: Blob
) {
  const handle = await picker({ suggestedName: fileName })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

function downloadWithAnchor(
  documentRef: DownloadDocument,
  urlApi: ObjectUrlApi,
  fileName: string,
  blob: Blob
) {
  const url = urlApi.createObjectURL(blob)
  let anchor: HTMLAnchorElement | null = null
  let appended = false

  try {
    anchor = documentRef.createElement('a')
    anchor.href = url
    anchor.download = fileName
    documentRef.body.appendChild(anchor)
    appended = true
    anchor.click()
  } finally {
    if (anchor && appended) {
      documentRef.body.removeChild(anchor)
    }
    urlApi.revokeObjectURL(url)
  }
}

export async function saveFileToLocal(
  options: SaveFileToLocalOptions
): Promise<SaveFileToLocalResult> {
  const blob = await fetchLocalFileBlob(options)
  const fileName = getLocalSaveFileName(options.fileName)
  const picker =
    options.showSaveFilePicker === undefined
      ? getDefaultSaveFilePicker()
      : options.showSaveFilePicker

  if (picker) {
    await saveWithPicker(picker, fileName, blob)
    return { method: 'picker' }
  }

  downloadWithAnchor(
    options.documentRef || getDefaultDocument(),
    options.urlApi || URL,
    fileName,
    blob
  )
  return { method: 'download' }
}
