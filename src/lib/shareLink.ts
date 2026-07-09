const MOST_BOX_SHARE_ORIGIN = 'https://most.box'

function normalizeShareOrigin(origin?: string) {
  const normalizedOrigin = String(origin || '')
    .trim()
    .replace(/\/+$/, '')

  if (!normalizedOrigin || normalizedOrigin === 'null') {
    return MOST_BOX_SHARE_ORIGIN
  }

  return normalizedOrigin
}

function getShareOrigin() {
  if (typeof window === 'undefined') return MOST_BOX_SHARE_ORIGIN

  return normalizeShareOrigin(window.location?.origin)
}

function getTrimmedFileName(fileName?: string) {
  const trimmedFileName = String(fileName || '').trim()
  return trimmedFileName
}

export function buildMostShareLink(cid: string, fileName?: string) {
  const trimmedFileName = getTrimmedFileName(fileName)

  if (!trimmedFileName) return `most://${cid}`

  return `most://${cid}?filename=${encodeURIComponent(trimmedFileName)}`
}

export function buildCidShareLink(cid: string, fileName?: string) {
  const trimmedFileName = getTrimmedFileName(fileName)
  const cidPath = `${getShareOrigin()}/cid/${encodeURIComponent(cid)}`

  if (!trimmedFileName) return cidPath

  return `${cidPath}?filename=${encodeURIComponent(trimmedFileName)}`
}
