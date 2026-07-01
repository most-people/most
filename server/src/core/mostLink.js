import { CID } from 'multiformats/cid'

export const MOST_LINK_ERROR_CODES = {
  CID_EMPTY: 'cid_empty',
  INVALID_CID_FORMAT: 'invalid_cid_format',
  CID_V1_REQUIRED: 'cid_v1_required',
  CID_DIGEST_LENGTH: 'cid_digest_length',
  LINK_EMPTY: 'link_empty',
  INVALID_URL: 'invalid_url',
  INVALID_PROTOCOL: 'invalid_protocol',
  UNSUPPORTED_PATH: 'unsupported_path',
  UNSUPPORTED_QUERY_PARAM: 'unsupported_query_param',
}

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

function extractTailTarget(value) {
  const queryStart = value.indexOf('?')
  const pathPart = queryStart === -1 ? value : value.slice(0, queryStart)
  const queryPart = queryStart === -1 ? '' : value.slice(queryStart)
  const slashIndex = pathPart.lastIndexOf('/')
  const tailPath = slashIndex === -1 ? pathPart : pathPart.slice(slashIndex + 1)

  return `${tailPath}${queryPart}`
}

/**
 * 验证 CID 字符串
 * @param {string} cidString - 要验证的 CID 字符串
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

/**
 * 解析 most:// 链接并提取 CID 与用户可见文件名
 * @param {string} link - most://<cid>?filename=... 格式的链接
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
  const queryString =
    queryStart === -1 ? '' : tailTarget.slice(queryStart + 1)

  if (!cidString) {
    return invalidLink(MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT)
  }

  const searchParams = new URLSearchParams(queryString)
  const rawFileName = searchParams.get('filename')
  const unsupportedParam = [...searchParams.keys()].find(
    key => key !== 'filename'
  )

  if (queryString && ![...searchParams.keys()].length) {
    return invalidLink(MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM, {
      param: '',
    })
  }

  const validation = validateCidString(cidString)
  if (!validation.valid) {
    return invalidLink(validation.errorCode)
  }

  if (unsupportedParam) {
    return invalidLink(
      MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM,
      { param: unsupportedParam }
    )
  }

  const fileName = rawFileName?.trim() || cidString

  return { cid: cidString, fileName }
}

export function buildMostLink(cid, fileName) {
  const trimmedFileName = String(fileName || '').trim()
  if (!trimmedFileName) {
    return `most://${cid}`
  }
  return `most://${cid}?filename=${encodeURIComponent(trimmedFileName)}`
}
