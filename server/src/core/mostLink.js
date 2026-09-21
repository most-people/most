/**
 * most:// link parsing and CID validation.
 *
 * The implementation lives in `@most-box/protocol` so the desktop daemon, the
 * web frontend, and the mobile app all share one parser and one error-code
 * table. This file stays as the daemon-facing module path.
 */
export {
  MOST_LINK_ERROR_CODES,
  buildMostLink,
  parseMostLink,
  validateCidString,
} from '@most-box/protocol'
