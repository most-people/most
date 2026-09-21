/**
 * Derives the Hyperswarm topic and Hyperdrive namespace for a CID.
 *
 * The topic is exactly `cid.multihash.digest` with no extra hashing,
 * truncation, or topic transformation. That rule is a product invariant: the
 * publisher, every seeder, and every downloader must arrive at the same topic
 * from the link alone.
 *
 * `topic` is a plain `Uint8Array` rather than a `b4a`/`Buffer` so this module
 * runs unchanged on Node, in the browser, and inside a Bare worklet.
 */
import { CID } from 'multiformats/cid'

import { MOST_LINK_ERROR_CODES, validateCidString } from './most-link.js'

const CID_INFO_ERROR_MESSAGES = {
  [MOST_LINK_ERROR_CODES.CID_EMPTY]: 'CID is required',
  [MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT]: 'Invalid CID format',
  [MOST_LINK_ERROR_CODES.CID_V1_REQUIRED]: 'CID v1 required',
  [MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH]: 'CID digest must be 32 bytes',
}

export const CID_TOPIC_JOIN_OPTIONS = Object.freeze({
  server: true,
  client: true,
})

/**
 * Builds the validation error thrown by `getCidInfo`.
 *
 * The daemon passes its own `ValidationError` subclass to keep HTTP error
 * mapping intact; other runtimes fall back to a plain `Error` that still
 * carries the canonical `errorCode`.
 */
function createCidValidationError(errorCode, createValidationError) {
  const message = CID_INFO_ERROR_MESSAGES[errorCode] || errorCode
  if (typeof createValidationError === 'function') {
    return createValidationError(message, errorCode)
  }
  const error = new Error(message)
  error.code = 'VALIDATION_ERROR'
  error.errorCode = errorCode
  return error
}

export function getCidInfo(cid, options = {}) {
  const { createValidationError } = options
  try {
    const validation = validateCidString(cid)
    if (!validation.valid) {
      throw createCidValidationError(
        validation.errorCode,
        createValidationError
      )
    }
    const parsedCid = CID.parse(cid)
    const digest = parsedCid.multihash.digest
    if (digest.length !== 32) {
      throw createCidValidationError(
        MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH,
        createValidationError
      )
    }
    const topic = Uint8Array.from(digest)
    const topicHex = Array.from(topic)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
    return {
      // Normalized CID string, so callers never have to re-parse the input.
      cid: parsedCid.toString(),
      topic,
      topicHex,
      driveName: `drive-${topicHex}`,
    }
  } catch (err) {
    if (err && err.errorCode) {
      throw err
    }
    throw createCidValidationError(
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT,
      createValidationError
    )
  }
}
