import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateCidString, parseMostLink } from '../../src/core/cid.js'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

function assertInvalidCid(input, error) {
  const result = validateCidString(input)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.error, error)
}

function assertInvalidLink(input, error) {
  const result = parseMostLink(input)
  assert.strictEqual(result.cid, '')
  assert.strictEqual(result.error, error)
}

function mostLink(fileName = 'a.txt') {
  return `most://${VALID_CID}?filename=${encodeURIComponent(fileName)}`
}

describe('validateCidString', () => {
  it('rejects null', () => {
    assertInvalidCid(null, 'CID must be a non-empty string')
  })

  it('rejects undefined', () => {
    assertInvalidCid(undefined, 'CID must be a non-empty string')
  })

  it('rejects non-string values', () => {
    assert.strictEqual(validateCidString(123).valid, false)
    assert.strictEqual(validateCidString({}).valid, false)
    assert.strictEqual(validateCidString([]).valid, false)
  })

  it('rejects empty string', () => {
    assertInvalidCid('', 'CID must be a non-empty string')
  })

  it('rejects CID v0', () => {
    assertInvalidCid(
      'QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX',
      'Invalid CID format: CID v1 required'
    )
  })

  it('rejects fake CID v1 strings', () => {
    assertInvalidCid('bafkreid', 'Invalid CID format')
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
    assert.strictEqual(result.error, undefined)
  })

  it('decodes URL-encoded filenames with spaces and Unicode', () => {
    const fileName = '测试 文件 01.txt'
    const result = parseMostLink(mostLink(fileName))
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, fileName)
    assert.strictEqual(result.error, undefined)
  })

  it('rejects CID without most:// prefix', () => {
    assertInvalidLink(VALID_CID, 'Link must be a valid most:// URL')
  })

  it('rejects trailing slashes', () => {
    assertInvalidLink(`most://${VALID_CID}///`, 'Link path is not supported')
  })

  it('rejects extra path components', () => {
    assertInvalidLink(
      `most://${VALID_CID}/some/path`,
      'Link path is not supported'
    )
  })

  it('rejects links without filename', () => {
    assertInvalidLink(`most://${VALID_CID}`, 'filename is required')
  })

  it('rejects blank filename values', () => {
    assertInvalidLink(
      `most://${VALID_CID}?filename=%20%20`,
      'filename is required'
    )
  })

  it('rejects unsupported query parameters', () => {
    assertInvalidLink(
      `most://${VALID_CID}?filename=a.txt&foo=bar`,
      'Unsupported query parameter: foo'
    )
  })

  it('rejects invalid CID format', () => {
    assertInvalidLink('most://invalid', 'Invalid CID format')
  })

  it('rejects null/undefined', () => {
    assertInvalidLink(null, 'Link must be a non-empty string')
    assertInvalidLink(undefined, 'Link must be a non-empty string')
  })

  it('rejects CID v0', () => {
    assertInvalidLink(
      'most://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX?filename=a.txt',
      'Invalid CID format: CID v1 required'
    )
  })
})
