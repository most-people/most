import b4a from 'b4a'
import { CID } from 'multiformats/cid'
import { MOST_LINK_ERROR_CODES, validateCidString } from './cid.js'
import { ValidationError } from '../utils/errors.js'

const CID_INFO_ERROR_MESSAGES = {
  [MOST_LINK_ERROR_CODES.CID_EMPTY]: 'CID is required',
  [MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT]: 'Invalid CID format',
  [MOST_LINK_ERROR_CODES.CID_V1_REQUIRED]: 'CID v1 required',
  [MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH]: 'CID digest must be 32 bytes',
}

function cidValidationError(errorCode) {
  return new ValidationError(
    CID_INFO_ERROR_MESSAGES[errorCode] || errorCode,
    errorCode
  )
}

export function getCidInfo(cid) {
  try {
    const validation = validateCidString(cid)
    if (!validation.valid) {
      throw cidValidationError(validation.errorCode)
    }
    const parsedCid = CID.parse(cid)
    const topic = b4a.from(parsedCid.multihash.digest)
    if (topic.length !== 32) {
      throw cidValidationError(MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH)
    }
    const topicHex = b4a.toString(topic, 'hex')
    return {
      topic,
      topicHex,
      driveName: `drive-${topicHex}`,
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err
    }
    throw cidValidationError(MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT)
  }
}
