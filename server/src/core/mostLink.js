import { CID } from 'multiformats/cid'

/**
 * 验证 CID 字符串
 * @param {string} cidString - 要验证的 CID 字符串
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCidString(cidString) {
  if (!cidString || typeof cidString !== 'string') {
    return { valid: false, error: 'CID must be a non-empty string' }
  }

  let parsed
  try {
    parsed = CID.parse(cidString)
  } catch {
    return {
      valid: false,
      error: 'Invalid CID format',
    }
  }

  if (parsed.version !== 1) {
    return {
      valid: false,
      error: 'Invalid CID format: CID v1 required',
    }
  }

  if (parsed.multihash.digest.length !== 32) {
    return {
      valid: false,
      error: 'CID digest must be 32 bytes',
    }
  }

  return { valid: true }
}

/**
 * 解析 most:// 链接并提取 CID 与用户可见文件名
 * @param {string} link - most://<cid>?filename=... 格式的链接
 * @returns {{ cid: string, fileName?: string, error?: string }}
 */
export function parseMostLink(link) {
  if (!link || typeof link !== 'string') {
    return { cid: '', error: 'Link must be a non-empty string' }
  }

  let url
  try {
    url = new URL(link)
  } catch {
    return { cid: '', error: 'Link must be a valid most:// URL' }
  }

  if (url.protocol !== 'most:') {
    return { cid: '', error: 'Link must use most:// protocol' }
  }

  if (url.pathname && url.pathname !== '/') {
    return { cid: '', error: 'Link path is not supported' }
  }

  const cidString = url.hostname
  const fileName = url.searchParams.get('filename')
  const unsupportedParam = [...url.searchParams.keys()].find(
    key => key !== 'filename'
  )

  const validation = validateCidString(cidString)
  if (!validation.valid) {
    return { cid: '', error: validation.error }
  }

  if (!fileName) {
    return { cid: '', error: 'filename is required' }
  }

  if (unsupportedParam) {
    return {
      cid: '',
      error: `Unsupported query parameter: ${unsupportedParam}`,
    }
  }

  return { cid: cidString, fileName }
}
