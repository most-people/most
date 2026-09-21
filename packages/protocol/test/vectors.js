/**
 * Golden protocol vectors shared by every runtime.
 *
 * Each runtime (Node daemon, web frontend, mobile Bare worklet) must satisfy
 * these exact expectations. This is the mechanism that stops the most://, CID,
 * topic, and account rules from drifting apart again.
 *
 * Values are frozen — do not "fix" them to make a runtime pass. A mismatch means
 * that runtime diverged from the content-identity contract.
 */

/** sha256 of "hello world" — a CID v1 raw leaf with a 32 byte digest. */
export const VALID_CID =
  'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yetv5zh7fzka'

/** CID v1 with a dag-pb codec and a 32 byte digest — still a valid most:// CID. */
export const CID_V1_DAGPB =
  'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

/**
 * CID v1 with a raw codec but a 16 byte digest.
 *
 * `CID_V1_DAGPB` above looks like a wrong-digest CID but is actually valid
 * (v1, 32 byte digest), so it is a parse *success* case below.
 */
export const CID_V1_SHORT_DIGEST = 'bafkreeajbeeqscijbeeqscijbeeqscij'

/** CID v0 (base58, sha2-256, implicit dag-pb). */
export const CID_V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'

export const GOLDEN_TOPIC_HEX =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73049d7b93fcb950'

export const GOLDEN_TOPIC_BYTES = [
  44, 242, 77, 186, 95, 176, 163, 14, 38, 232, 59, 42, 197, 185, 226, 158, 27,
  22, 30, 92, 31, 167, 66, 94, 115, 4, 157, 123, 147, 252, 185, 80,
]

export const GOLDEN_DRIVE_NAME = `drive-${GOLDEN_TOPIC_HEX}`

export const GOLDEN_ACCOUNTS = [
  {
    username: 'quickstart',
    password: 'quickstart',
    address: '0xE560F6d38b9a405e819B66c2407c02A64a58c86A',
    danger:
      '0x968c1ff3d621bcbe02f4933daa788561d0fc7a39ef58d919c88078b74f51bad8',
  },
  {
    username: 'alice',
    password: 'correct horse battery staple',
    address: '0x023B10b4e691580966D160FbF50Dce5596A97D4C',
  },
]

export const GOLDEN_AUTH_MESSAGES = [
  {
    timestamp: '1700000000000',
    method: 'post',
    path: '/api/publish?x=1',
    expected: '1700000000000:POST:/api/publish',
  },
  {
    timestamp: '1700000000000',
    method: 'GET',
    path: '/ws',
    expected: '1700000000000:GET:/ws',
  },
  {
    timestamp: '1',
    method: 'delete',
    path: 'https://most.box/api/files/x',
    expected: '1:DELETE:/api/files/x',
  },
]

export const LINK_CASES = [
  { input: VALID_CID, cid: VALID_CID, fileName: VALID_CID },
  { input: `most://${VALID_CID}`, cid: VALID_CID, fileName: VALID_CID },
  {
    input: `most://${VALID_CID}?filename=hello.txt`,
    cid: VALID_CID,
    fileName: 'hello.txt',
  },
  {
    input: `https://most.box/${VALID_CID}`,
    cid: VALID_CID,
    fileName: VALID_CID,
  },
  {
    input: `https://most.box/cid/${VALID_CID}?filename=a.bin`,
    cid: VALID_CID,
    fileName: 'a.bin',
  },
  {
    input: `  most://${VALID_CID}?filename=b.bin  `,
    cid: VALID_CID,
    fileName: 'b.bin',
  },
  {
    input: `most://${VALID_CID}?filename=`,
    cid: VALID_CID,
    fileName: VALID_CID,
  },
  // A 32 byte digest CID v1 with a dag-pb codec is valid too.
  {
    input: CID_V1_DAGPB,
    cid: CID_V1_DAGPB,
    fileName: CID_V1_DAGPB,
  },
  // A trailing ampersand produces no unsupported key.
  {
    input: `most://${VALID_CID}?filename=a&`,
    cid: VALID_CID,
    fileName: 'a',
  },
  // A bare question mark yields an empty query string.
  {
    input: `most://${VALID_CID}?`,
    cid: VALID_CID,
    fileName: VALID_CID,
  },
]

/**
 * Error cases assert `errorCode` and `details` only.
 *
 * `parseMostLink` does not promise an empty `cid` on failure: some failure
 * branches return `cid: ''` while others echo the parsed target. Consumers must
 * branch on `errorCode`, never on the presence of `cid`.
 */
export const LINK_ERROR_CASES = [
  { input: '', errorCode: 'link_empty' },
  { input: '   ', errorCode: 'link_empty' },
  { input: 'most://', errorCode: 'invalid_cid_format' },
  { input: 'most://notacid', errorCode: 'invalid_cid_format' },
  { input: CID_V0, errorCode: 'cid_v1_required' },
  { input: CID_V1_SHORT_DIGEST, errorCode: 'cid_digest_length' },
  {
    input: `most://${VALID_CID}?other=1`,
    errorCode: 'unsupported_query_param',
    details: { param: 'other' },
  },
  {
    input: `most://${VALID_CID}?filename=a&other=1`,
    errorCode: 'unsupported_query_param',
    details: { param: 'other' },
  },
  {
    input: `most://${VALID_CID}?filename=a&b=2`,
    errorCode: 'unsupported_query_param',
    details: { param: 'b' },
  },
]
