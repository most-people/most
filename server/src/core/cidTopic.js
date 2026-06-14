import b4a from 'b4a'
import { CID } from 'multiformats/cid'
import { MOST_LINK_ERROR_CODES, validateCidString } from './cid.js'
import { ValidationError } from '../utils/errors.js'

export function getCidInfo(cid) {
  try {
    const validation = validateCidString(cid)
    if (!validation.valid) {
      throw new ValidationError(validation.errorCode, validation.errorCode)
    }
    const parsedCid = CID.parse(cid)
    const topic = b4a.from(parsedCid.multihash.digest)
    if (topic.length !== 32) {
      throw new ValidationError(
        MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH,
        MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH
      )
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
    throw new ValidationError(
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT,
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT
    )
  }
}
