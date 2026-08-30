import { parseMostLink } from '~server/src/core/mostLink.js'

interface MostMarkdownReference {
  cid: string
  fileName: string
  link: string
}

interface BuildMostMarkdownAttachmentOptions {
  link: string
  fileName: string
  image: boolean
}

const NOTE_FILE_ROOT = 'note-file'

type ObjectUrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

export interface MostMarkdownImageUrlCache {
  getOrCreate: (cid: string, loadBlob: () => Promise<Blob>) => Promise<string>
  dispose: () => void
}

export function buildNoteAttachmentFileName(
  fileName: string,
  attachmentId: string
) {
  return `${NOTE_FILE_ROOT}/${attachmentId}/${fileName}`
}

export function createMostMarkdownImageUrlCache(
  urlApi: ObjectUrlApi = URL
): MostMarkdownImageUrlCache {
  const urls = new Map<string, string>()
  const pending = new Map<string, Promise<string>>()
  let disposed = false

  return {
    getOrCreate(cid, loadBlob) {
      if (disposed) return Promise.resolve('')

      const cachedUrl = urls.get(cid)
      if (cachedUrl) return Promise.resolve(cachedUrl)

      const pendingUrl = pending.get(cid)
      if (pendingUrl) return pendingUrl

      const nextUrl = loadBlob()
        .then(blob => {
          const objectUrl = urlApi.createObjectURL(blob)
          if (disposed) {
            urlApi.revokeObjectURL(objectUrl)
            return ''
          }
          urls.set(cid, objectUrl)
          return objectUrl
        })
        .finally(() => {
          if (pending.get(cid) === nextUrl) pending.delete(cid)
        })
      pending.set(cid, nextUrl)
      return nextUrl
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const objectUrl of urls.values()) {
        urlApi.revokeObjectURL(objectUrl)
      }
      urls.clear()
    },
  }
}

export function parseMostMarkdownReference(
  value: string
): MostMarkdownReference | null {
  const link = String(value || '').trim()
  if (!/^most:\/\//i.test(link)) return null

  const parsed = parseMostLink(link)
  if (parsed.errorCode || !parsed.cid) return null

  return {
    cid: parsed.cid,
    fileName: parsed.fileName || parsed.cid,
    link,
  }
}

function escapeMarkdownLabel(value: string) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\[\]]/g, '\\$&')
}

function escapeMarkdownDestination(value: string) {
  return value.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

export function buildMostMarkdownAttachment({
  link,
  fileName,
  image,
}: BuildMostMarkdownAttachmentOptions) {
  const reference = parseMostMarkdownReference(link)
  if (!reference) throw new Error('Invalid most:// link')

  const label = escapeMarkdownLabel(fileName || reference.fileName)
  const destination = escapeMarkdownDestination(reference.link)
  return `${image ? '!' : ''}[${label}](${destination})`
}
