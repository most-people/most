import { parseMostLink, validateCidString } from './cid.js'
import { sanitizeFilename } from '../utils/security.js'
import { ValidationError } from '../utils/errors.js'

const CHANNEL_ATTACHMENT_KINDS = new Set([
  'image',
  'video',
  'audio',
  'text',
  'file',
])

export function normalizeChannelAttachment(input) {
  if (input === undefined || input === null) return null
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('attachment must be an object')
  }

  const kind = String(input.kind || '').trim()
  if (!CHANNEL_ATTACHMENT_KINDS.has(kind)) {
    throw new ValidationError('Invalid attachment kind')
  }

  const cid = String(input.cid || '').trim()
  const cidValidation = validateCidString(cid)
  if (!cidValidation.valid) {
    throw new ValidationError(cidValidation.errorCode, cidValidation.errorCode)
  }

  const fileName = sanitizeFilename(String(input.fileName || ''))
  if (!fileName || fileName === 'unnamed_file') {
    throw new ValidationError('attachment fileName is required')
  }

  const parsed = parseMostLink(String(input.link || '').trim())
  if (parsed.errorCode) {
    throw new ValidationError(
      parsed.errorCode,
      parsed.errorCode,
      parsed.details
    )
  }
  if (parsed.cid !== cid) {
    throw new ValidationError('attachment link CID mismatch')
  }

  const linkFileName = sanitizeFilename(parsed.fileName)
  if (linkFileName !== fileName) {
    throw new ValidationError('attachment link filename mismatch')
  }

  const attachment = {
    kind,
    cid,
    fileName,
    link: `most://${cid}?filename=${encodeURIComponent(fileName)}`,
  }

  if (typeof input.mimeType === 'string' && input.mimeType.length <= 100) {
    attachment.mimeType = input.mimeType
  }

  if (input.size !== undefined && input.size !== null) {
    const size = Number(input.size)
    if (!Number.isFinite(size) || size < 0) {
      throw new ValidationError('attachment size must be a non-negative number')
    }
    attachment.size = Math.floor(size)
  }

  return attachment
}
