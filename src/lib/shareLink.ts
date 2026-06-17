const MOST_BOX_SHARE_ORIGIN = 'https://most.box'

export function buildCidShareLink(cid: string, fileName?: string) {
  const trimmedFileName = String(fileName || '').trim()
  const cidPath = `${MOST_BOX_SHARE_ORIGIN}/cid/${encodeURIComponent(cid)}`

  if (!trimmedFileName) return cidPath

  return `${cidPath}?filename=${encodeURIComponent(trimmedFileName)}`
}
