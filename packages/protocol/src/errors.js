/**
 * Canonical most:// link error codes.
 *
 * These values are the public contract of the HTTP API and the mobile client.
 * Keep them lowercase and unprefixed; the mobile client previously used a
 * separate uppercase set (`MOST_LINK_INVALID_CID`) and was unified onto this
 * set.
 */
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
