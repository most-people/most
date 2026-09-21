/**
 * Shared MostBox protocol primitives.
 *
 * Consumed by the desktop daemon (`server/`), the web frontend (`src/`), and the
 * mobile app (`mobile/app/`) — including the Bare worklet, so nothing in this
 * package may import a `node:` builtin or rely on `Buffer`.
 */
export {
  MOST_LINK_ERROR_CODES,
  buildMostLink,
  parseMostLink,
  validateCidString,
} from './most-link.js'

export { CID_TOPIC_JOIN_OPTIONS, getCidInfo } from './cid-topic.js'

export { normalizeAddress, shortAddress } from './address.js'

export {
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  mostMnemonic,
  mostSignMessage,
  mostWallet,
} from './wallet.js'

export {
  AUTH_MAX_AGE_MS,
  buildAuthMessage,
  normalizeAuthPath,
} from './auth-message.js'

export {
  bytesToHex,
  bytesToUtf8,
  hexToBytes,
  toUint8Array,
  utf8ToBytes,
} from './codec.js'
