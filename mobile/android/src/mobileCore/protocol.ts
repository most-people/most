import { CID } from 'multiformats/cid'

export type ParsedMostLink = {
  cid: string
  fileName: string
}

export const MOST_LINK_PROTOCOL = 'most:'
export const MOST_LINK_ERROR_MESSAGES = {
  linkEmpty: '请输入 most:// 分享链接',
  invalidUrl: '请输入有效的 most:// 分享链接',
  invalidProtocol: '链接必须以 most:// 开头',
  unsupportedPath: 'most:// 链接不能包含额外路径',
  unsupportedQuery: 'most:// 链接只支持 filename 参数',
  invalidCid: '链接中的 CID 无效',
  cidV1Required: '链接中的 CID 必须是 CID v1',
  cidDigestLength: 'CID digest 必须是 32 字节',
} as const

export function buildMostLink(cid: string, filename: string) {
  const trimmedFilename = filename.trim()
  if (!trimmedFilename) return `most://${cid}`
  return `most://${cid}?filename=${encodeURIComponent(trimmedFilename)}`
}

export function getHyperdriveCidPath(cid: string) {
  return `/${cid}`
}

export function getCidTopicDigest(cid: string) {
  return CID.parse(cid).multihash.digest
}

export function parseMostLink(link: string): ParsedMostLink {
  if (!link || typeof link !== 'string') {
    throw new Error(MOST_LINK_ERROR_MESSAGES.linkEmpty)
  }

  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new Error(MOST_LINK_ERROR_MESSAGES.invalidUrl)
  }

  if (url.protocol !== MOST_LINK_PROTOCOL) {
    throw new Error(MOST_LINK_ERROR_MESSAGES.invalidProtocol)
  }

  if (url.pathname && url.pathname !== '/') {
    throw new Error(MOST_LINK_ERROR_MESSAGES.unsupportedPath)
  }

  const unsupportedParam = [...url.searchParams.keys()].find(
    key => key !== 'filename'
  )
  if (unsupportedParam) {
    throw new Error(MOST_LINK_ERROR_MESSAGES.unsupportedQuery)
  }

  const cid = url.hostname
  let parsedCid: ReturnType<typeof CID.parse>
  try {
    parsedCid = CID.parse(cid)
  } catch {
    throw new Error(MOST_LINK_ERROR_MESSAGES.invalidCid)
  }

  if (parsedCid.version !== 1) {
    throw new Error(MOST_LINK_ERROR_MESSAGES.cidV1Required)
  }

  if (parsedCid.multihash.digest.length !== 32) {
    throw new Error(MOST_LINK_ERROR_MESSAGES.cidDigestLength)
  }

  const fileName = url.searchParams.get('filename')?.trim() || cid

  return { cid, fileName }
}

export function createProtocolSummary(cid: string) {
  const topicDigest = getCidTopicDigest(cid)
  return {
    cid,
    drivePath: getHyperdriveCidPath(cid),
    topicDigestBytes: topicDigest.byteLength,
  }
}
