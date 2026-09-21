/**
 * Canonical CID identity rules for MostBox.
 *
 * These mirror `server/src/core/mostLink.js` exactly. They are the single
 * source of truth for what counts as a valid `most://` CID: CID v1 with a
 * 32-byte multihash digest.
 */
import { CID } from 'multiformats/cid'

import { MOST_LINK_ERROR_CODES } from './errors.js'

function invalidCid(errorCode) {
  return { valid: false, errorCode }
}

function invalidLink(errorCode, details) {
  return {
    cid: '',
    errorCode,
    ...(details ? { details } : {}),
  }
}

const LINK_PARSE_BASE_URL = 'https://most.box/'

function parseLinkUrl(value) {
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

function extractTailTarget(value) {
  const url = parseLinkUrl(value)
  if (!url) return value

  if (
    url.protocol === 'most:' &&
    (!url.pathname || (url.search && /^\/+$/.test(url.pathname)))
  ) {
    return `${url.hostname}${url.search}`
  }

  const pathName = url.search ? url.pathname.replace(/\/+$/, '') : url.pathname
  const tailPath = pathName.split('/').filter(Boolean).at(-1) || ''

  return `${tailPath}${url.search}`
}

/**
 * Validates a CID string.
 * @param {string} cidString
 * @returns {{ valid: boolean, errorCode?: string }}
 */
export function validateCidString(cidString) {
  if (!cidString || typeof cidString !== 'string') {
    return invalidCid(MOST_LINK_ERROR_CODES.CID_EMPTY)
  }

  let parsed
  try {
    parsed = CID.parse(cidString)
  } catch {
    return invalidCid(MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT)
  }

  if (parsed.version !== 1) {
    return invalidCid(MOST_LINK_ERROR_CODES.CID_V1_REQUIRED)
  }

  if (parsed.multihash.digest.length !== 32) {
    return invalidCid(MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH)
  }

  return { valid: true }
}

function decodeQueryPart(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '))
  } catch {
    return String(value)
  }
}

/**
 * Reads the `filename` parameter and detects any unsupported parameter.
 *
 * Deliberately avoids `URLSearchParams#keys()`: React Native and the Bare
 * worklet do not guarantee iterator support on `URLSearchParams`, and this
 * package must parse links identically on every runtime.
 */
function parseMostLinkQuery(queryString) {
  let fileName = null
  let unsupportedParam = null

  for (const part of queryString.split('&')) {
    if (!part) continue
    const separatorIndex = part.indexOf('=')
    const rawKey = separatorIndex === -1 ? part : part.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1)
    const key = decodeQueryPart(rawKey)

    if (key !== 'filename') {
      if (unsupportedParam === null) unsupportedParam = key
      continue
    }
    if (fileName === null) fileName = decodeQueryPart(rawValue)
  }

  return { fileName, unsupportedParam }
}

/**
 * Parses a most:// link into its CID and user-visible file name.
 * @param {string} link
 * @returns {{ cid: string, fileName?: string, errorCode?: string, details?: Record<string, string> }}
 */
export function parseMostLink(link) {
  if (!link || typeof link !== 'string') {
    return invalidLink(MOST_LINK_ERROR_CODES.LINK_EMPTY)
  }

  const value = link.trim()
  if (!value) {
    return invalidLink(MOST_LINK_ERROR_CODES.LINK_EMPTY)
  }

  const tailTarget = extractTailTarget(value)
  const queryStart = tailTarget.indexOf('?')
  const cidString =
    queryStart === -1 ? tailTarget : tailTarget.slice(0, queryStart)
  const queryString = queryStart === -1 ? '' : tailTarget.slice(queryStart + 1)

  if (!cidString) {
    return invalidLink(MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT)
  }

  const { fileName: rawFileName, unsupportedParam } =
    parseMostLinkQuery(queryString)

  // A query string that yields no usable parameter at all is malformed.
  if (queryString && unsupportedParam === null && rawFileName === null) {
    return invalidLink(MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM, {
      param: '',
    })
  }

  const validation = validateCidString(cidString)
  if (!validation.valid) {
    return invalidLink(validation.errorCode)
  }

  if (unsupportedParam !== null) {
    return invalidLink(MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM, {
      param: unsupportedParam,
    })
  }

  const fileName = String(rawFileName ?? '').trim() || cidString

  return { cid: cidString, fileName }
}

export function buildMostLink(cid, fileName) {
  const trimmedFileName = String(fileName || '').trim()
  if (!trimmedFileName) {
    return `most://${cid}`
  }
  return `most://${cid}?filename=${encodeURIComponent(trimmedFileName)}`
}

export { MOST_LINK_ERROR_CODES }
