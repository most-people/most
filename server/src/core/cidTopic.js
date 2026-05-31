import b4a from 'b4a'
import { CID } from 'multiformats/cid'
import { validateCidString } from './cid.js'
import { ValidationError } from '../utils/errors.js'

export function getCidInfo(cid) {
  try {
    const validation = validateCidString(cid)
    if (!validation.valid) {
      throw new ValidationError(validation.error)
    }
    const parsedCid = CID.parse(cid)
    const topic = b4a.from(parsedCid.multihash.digest)
    if (topic.length !== 32) {
      throw new ValidationError('CID digest must be 32 bytes')
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
    throw new ValidationError('Invalid CID format')
  }
}
