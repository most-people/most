const MOST_BOX_SHARE_ORIGIN = 'https://most.box'

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
  const cidPath = `${MOST_BOX_SHARE_ORIGIN}/cid/${encodeURIComponent(cid)}`

  if (!trimmedFileName) return cidPath

  return `${cidPath}?filename=${encodeURIComponent(trimmedFileName)}`
}
