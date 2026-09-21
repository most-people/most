/**
 * Derives the Hyperswarm topic and Hyperdrive namespace for a CID.
 *
 * The derivation is shared with the mobile app through `@most-box/protocol`.
 * This wrapper only injects the daemon's `ValidationError` subclass so HTTP
 * error mapping keeps working; the topic rules themselves are not duplicated.
 */
import {
  CID_TOPIC_JOIN_OPTIONS,
  getCidInfo as getSharedCidInfo,
} from '@most-box/protocol'

import { ValidationError } from '../utils/errors.js'

export { CID_TOPIC_JOIN_OPTIONS }

export function getCidInfo(cid) {
  return getSharedCidInfo(cid, {
    createValidationError: (message, errorCode) =>
      new ValidationError(message, errorCode),
  })
}
