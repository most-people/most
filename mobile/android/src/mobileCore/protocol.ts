import { CID } from 'multiformats/cid'

export type ParsedMostLink = {
  cid: string
  filename: string
}

export const MOST_LINK_PROTOCOL = 'most:'

export function buildMostLink(cid: string, filename: string) {
  const params = new URLSearchParams()
  if (filename) params.set('filename', filename)
  const query = params.toString()
  return `most://${cid}${query ? `?${query}` : ''}`
}

export function getHyperdriveCidPath(cid: string) {
  return `/${cid}`
}

export function getCidTopicDigest(cid: string) {
  return CID.parse(cid).multihash.digest
}

export function parseMostLink(link: string): ParsedMostLink {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new Error('请输入有效的 most:// 分享链接')
  }

  if (url.protocol !== MOST_LINK_PROTOCOL || !url.hostname) {
    throw new Error('链接必须以 most:// 开头')
  }

  const cid = url.hostname
  try {
    CID.parse(cid)
  } catch {
    throw new Error('链接中的 CID 无效')
  }

  const filename = url.searchParams.get('filename') || ''
  if (!filename) {
    throw new Error('分享链接缺少 filename 参数')
  }

  return { cid, filename }
}

export function createProtocolSummary(cid: string) {
  const topicDigest = getCidTopicDigest(cid)
  return {
    cid,
    drivePath: getHyperdriveCidPath(cid),
    topicDigestBytes: topicDigest.byteLength,
  }
}
