import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  MOST_LINK_ERROR_CODES,
  validateCidString,
  parseMostLink,
} from '../../src/core/cid.js'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

function assertInvalidCid(input, errorCode) {
  const result = validateCidString(input)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errorCode, errorCode)
  assert.strictEqual(Object.hasOwn(result, 'error'), false)
}

function assertInvalidLink(input, errorCode) {
  const result = parseMostLink(input)
  assert.strictEqual(result.cid, '')
  assert.strictEqual(result.errorCode, errorCode)
  assert.strictEqual(Object.hasOwn(result, 'error'), false)
  return result
}

function mostLink(fileName = 'a.txt') {
  return `most://${VALID_CID}?filename=${encodeURIComponent(fileName)}`
}

describe('validateCidString', () => {
  it('rejects null', () => {
    assertInvalidCid(null, MOST_LINK_ERROR_CODES.CID_EMPTY)
  })

  it('rejects undefined', () => {
    assertInvalidCid(undefined, MOST_LINK_ERROR_CODES.CID_EMPTY)
  })

  it('rejects non-string values', () => {
    assertInvalidCid(123, MOST_LINK_ERROR_CODES.CID_EMPTY)
    assertInvalidCid({}, MOST_LINK_ERROR_CODES.CID_EMPTY)
    assertInvalidCid([], MOST_LINK_ERROR_CODES.CID_EMPTY)
  })

  it('rejects empty string', () => {
    assertInvalidCid('', MOST_LINK_ERROR_CODES.CID_EMPTY)
  })

  it('rejects CID v0', () => {
    assertInvalidCid(
      'QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX',
      MOST_LINK_ERROR_CODES.CID_V1_REQUIRED
    )
  })

  it('rejects fake CID v1 strings', () => {
    assertInvalidCid('bafkreid', MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT)
  })

  it('accepts valid CID v1 strings', () => {
    assert.strictEqual(validateCidString(VALID_CID).valid, true)
  })

  it('accepts CID with numbers', () => {
    assert.strictEqual(
      validateCidString(
        'bafybeiexg2oqkfnj56l7fcmawswqbijt5shq4b5rg6a546uwpkqqzwjioi'
      ).valid,
      true
    )
  })
})

describe('parseMostLink', () => {
  it('extracts CID and filename from most:// link', () => {
    const result = parseMostLink(mostLink())
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, 'a.txt')
    assert.strictEqual(result.errorCode, undefined)
    assert.strictEqual(Object.hasOwn(result, 'error'), false)
  })

  it('decodes URL-encoded filenames with spaces and Unicode', () => {
    const fileName = '测试 文件 01.txt'
    const result = parseMostLink(mostLink(fileName))
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, fileName)
    assert.strictEqual(result.errorCode, undefined)
    assert.strictEqual(Object.hasOwn(result, 'error'), false)
  })

  it('rejects CID without most:// prefix', () => {
    assertInvalidLink(VALID_CID, MOST_LINK_ERROR_CODES.INVALID_URL)
  })

  it('rejects trailing slashes', () => {
    assertInvalidLink(
      `most://${VALID_CID}///`,
      MOST_LINK_ERROR_CODES.UNSUPPORTED_PATH
    )
  })

  it('rejects extra path components', () => {
    assertInvalidLink(
      `most://${VALID_CID}/some/path`,
      MOST_LINK_ERROR_CODES.UNSUPPORTED_PATH
    )
  })

  it('rejects links without filename', () => {
    assertInvalidLink(
      `most://${VALID_CID}`,
      MOST_LINK_ERROR_CODES.FILENAME_REQUIRED
    )
  })

  it('rejects blank filename values', () => {
    assertInvalidLink(
      `most://${VALID_CID}?filename=%20%20`,
      MOST_LINK_ERROR_CODES.FILENAME_REQUIRED
    )
  })

  it('rejects unsupported query parameters', () => {
    const result = assertInvalidLink(
      `most://${VALID_CID}?filename=a.txt&foo=bar`,
      MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM
    )
    assert.deepStrictEqual(result.details, { param: 'foo' })
  })

  it('rejects invalid CID format', () => {
    assertInvalidLink('most://invalid', MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT)
  })

  it('rejects null/undefined', () => {
    assertInvalidLink(null, MOST_LINK_ERROR_CODES.LINK_EMPTY)
    assertInvalidLink(undefined, MOST_LINK_ERROR_CODES.LINK_EMPTY)
  })

  it('rejects CID v0', () => {
    assertInvalidLink(
      'most://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX?filename=a.txt',
      MOST_LINK_ERROR_CODES.CID_V1_REQUIRED
    )
  })
})
