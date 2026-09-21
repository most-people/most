/**
 * Mobile-facing most:// helpers.
 *
 * Parsing and link building delegate to `@most-box/protocol` so the phone, the
 * web frontend, and the desktop daemon share one parser and one error-code
 * table. This module only adapts the shared object-returning contract to the
 * throw-based contract the mobile UI already consumes, and keeps the small
 * mobile-only helpers.
 */
import {
  MOST_LINK_ERROR_CODES as SHARED_MOST_LINK_ERROR_CODES,
  buildMostLink as buildSharedMostLink,
  parseMostLink as parseSharedMostLink,
} from '@most-box/protocol/most-link'
import { getCidInfo } from '@most-box/protocol/cid-topic'

export type ParsedMostLink = {
  cid: string
  fileName: string
}

export type IncomingMostLink = ParsedMostLink & {
  link: string
}

export const MOST_LINK_PROTOCOL = 'most:'

/**
 * Canonical error codes.
 *
 * These were previously an uppercase mobile-only set (`MOST_LINK_INVALID_CID`)
 * that did not match the daemon's HTTP contract. They are now the shared
 * lowercase values.
 */
export const MOST_LINK_ERROR_CODES = {
  linkEmpty: SHARED_MOST_LINK_ERROR_CODES.LINK_EMPTY,
  invalidUrl: SHARED_MOST_LINK_ERROR_CODES.INVALID_URL,
  invalidProtocol: SHARED_MOST_LINK_ERROR_CODES.INVALID_PROTOCOL,
  unsupportedPath: SHARED_MOST_LINK_ERROR_CODES.UNSUPPORTED_PATH,
  unsupportedQuery: SHARED_MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM,
  invalidCid: SHARED_MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT,
  cidV1Required: SHARED_MOST_LINK_ERROR_CODES.CID_V1_REQUIRED,
  cidDigestLength: SHARED_MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH,
} as const

export function buildMostLink(cid: string, filename: string) {
  return buildSharedMostLink(cid, filename)
}

export function getHyperdriveCidPath(cid: string) {
  return `/${cid}`
}

export function getCidTopicDigest(cid: string) {
  return getCidInfo(cid).topic
}

export function parseMostLink(link: string): ParsedMostLink {
  const parsed = parseSharedMostLink(link)
  if (parsed.errorCode) {
    throw new Error(parsed.errorCode)
  }
  return { cid: parsed.cid, fileName: parsed.fileName || parsed.cid }
}

export function hasExplicitMostLinkFilename(link: string) {
  const parsed = parseSharedMostLink(link)
  if (parsed.errorCode) return false
  return Boolean(parsed.fileName) && parsed.fileName !== parsed.cid
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
