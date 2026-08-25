import { CID } from 'multiformats/cid'

export type ParsedMostLink = {
  cid: string
  fileName: string
}

export type IncomingMostLink = ParsedMostLink & {
  link: string
}

export const MOST_LINK_PROTOCOL = 'most:'
const PASSKEY_CALLBACK_HOST = 'passkey-callback'
const LINK_PARSE_BASE_URL = 'https://most.box/'
export const MOST_LINK_ERROR_CODES = {
  linkEmpty: 'MOST_LINK_EMPTY',
  invalidUrl: 'MOST_LINK_INVALID_URL',
  invalidProtocol: 'MOST_LINK_INVALID_PROTOCOL',
  unsupportedPath: 'MOST_LINK_UNSUPPORTED_PATH',
  unsupportedQuery: 'MOST_LINK_UNSUPPORTED_QUERY',
  invalidCid: 'MOST_LINK_INVALID_CID',
  cidV1Required: 'MOST_LINK_CID_V1_REQUIRED',
  cidDigestLength: 'MOST_LINK_CID_DIGEST_LENGTH',
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

function decodeQueryPart(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'))
  } catch {
    return value
  }
}

function parseMostLinkQuery(search: string) {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!query) return { fileName: '', unsupportedQuery: false }

  let fileName = ''
  let hasFileName = false
  for (const part of query.split('&')) {
    if (!part) continue

    const separatorIndex = part.indexOf('=')
    const rawKey = separatorIndex === -1 ? part : part.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1)
    const key = decodeQueryPart(rawKey)
    if (key !== 'filename') {
      return { fileName: '', unsupportedQuery: true }
    }

    if (!hasFileName) {
      fileName = decodeQueryPart(rawValue).trim()
      hasFileName = true
    }
  }

  return { fileName, unsupportedQuery: false }
}

function parseLinkUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    try {
      return new URL(value, LINK_PARSE_BASE_URL)
    } catch {
      return null
    }
  }
}

function extractTailTarget(value: string) {
  const url = parseLinkUrl(value)
  if (!url) return value

  if (
    url.protocol === MOST_LINK_PROTOCOL &&
    (!url.pathname || (url.search && /^\/+$/u.test(url.pathname)))
  ) {
    return `${url.hostname}${url.search}`
  }

  const pathName = url.search ? url.pathname.replace(/\/+$/u, '') : url.pathname
  const tailPath = pathName.split('/').filter(Boolean).at(-1) || ''

  return `${tailPath}${url.search}`
}

export function parseMostLink(link: string): ParsedMostLink {
  if (!link || typeof link !== 'string') {
    throw new Error(MOST_LINK_ERROR_CODES.linkEmpty)
  }

  const value = link.trim()
  if (!value) throw new Error(MOST_LINK_ERROR_CODES.linkEmpty)

  const tailTarget = extractTailTarget(value)
  const queryStart = tailTarget.indexOf('?')
  const cid = queryStart === -1 ? tailTarget : tailTarget.slice(0, queryStart)
  const search = queryStart === -1 ? '' : tailTarget.slice(queryStart + 1)
  const query = parseMostLinkQuery(search)
  if (query.unsupportedQuery) {
    throw new Error(MOST_LINK_ERROR_CODES.unsupportedQuery)
  }

  let parsedCid: ReturnType<typeof CID.parse>
  try {
    parsedCid = CID.parse(cid)
  } catch {
    throw new Error(MOST_LINK_ERROR_CODES.invalidCid)
  }

  if (parsedCid.version !== 1) {
    throw new Error(MOST_LINK_ERROR_CODES.cidV1Required)
  }

  if (parsedCid.multihash.digest.length !== 32) {
    throw new Error(MOST_LINK_ERROR_CODES.cidDigestLength)
  }

  const fileName = query.fileName || cid

  return { cid, fileName }
}

export function hasExplicitMostLinkFilename(link: string) {
  const value = String(link || '').trim()
  if (!value) return false

  const tailTarget = extractTailTarget(value)
  const queryStart = tailTarget.indexOf('?')
  if (queryStart === -1) return false

  const query = parseMostLinkQuery(tailTarget.slice(queryStart + 1))
  return !query.unsupportedQuery && Boolean(query.fileName)
}

export function parseIncomingMostLink(
  input: string | null | undefined
): IncomingMostLink | null {
  const link = input?.trim() || ''
  if (!link) return null

  let url: URL
  try {
    url = new URL(link)
  } catch {
    if (!link.toLowerCase().startsWith(MOST_LINK_PROTOCOL)) return null
    throw new Error(MOST_LINK_ERROR_CODES.invalidUrl)
  }

  if (url.protocol !== MOST_LINK_PROTOCOL) return null
  if (url.hostname === PASSKEY_CALLBACK_HOST) return null

  return {
    link,
    ...parseMostLink(link),
  }
}

export function createProtocolSummary(cid: string) {
  const topicDigest = getCidTopicDigest(cid)
  return {
    cid,
    drivePath: getHyperdriveCidPath(cid),
    topicDigestBytes: topicDigest.byteLength,
  }
}
