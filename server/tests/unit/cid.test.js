import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateCidString, parseMostLink } from '../../src/core/cid.js'

const VALID_CID =
  'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

describe('validateCidString', () => {
  it('rejects null', () => {
    const result = validateCidString(null)
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'CID must be a non-empty string')
  })

  it('rejects undefined', () => {
    const result = validateCidString(undefined)
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'CID must be a non-empty string')
  })

  it('rejects non-string values', () => {
    assert.strictEqual(validateCidString(123).valid, false)
    assert.strictEqual(validateCidString({}).valid, false)
    assert.strictEqual(validateCidString([]).valid, false)
  })

  it('rejects empty string', () => {
    const result = validateCidString('')
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'CID must be a non-empty string')
  })

  it('rejects CID v0', () => {
    const result = validateCidString(
      'QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX'
    )
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'Invalid CID format: CID v1 required')
  })

  it('rejects fake CID v1 strings', () => {
    const result = validateCidString('bafkreid')
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'Invalid CID format')
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
    const result = parseMostLink(`most://${VALID_CID}?filename=a.txt`)
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, 'a.txt')
    assert.strictEqual(result.error, undefined)
  })

  it('rejects CID without most:// prefix', () => {
    const result = parseMostLink(VALID_CID)
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'Link must be a valid most:// URL')
  })

  it('rejects trailing slashes', () => {
    const result = parseMostLink(`most://${VALID_CID}///`)
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'Link path is not supported')
  })

  it('rejects extra path components', () => {
    const result = parseMostLink(`most://${VALID_CID}/some/path`)
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'Link path is not supported')
  })

  it('rejects links without filename', () => {
    const result = parseMostLink(`most://${VALID_CID}`)
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'filename is required')
  })

  it('rejects unsupported query parameters', () => {
    const result = parseMostLink(`most://${VALID_CID}?filename=a.txt&foo=bar`)
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'Unsupported query parameter: foo')
  })

  it('rejects invalid CID format', () => {
    const result = parseMostLink('most://invalid')
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'Invalid CID format')
  })

  it('rejects null/undefined', () => {
    assert.strictEqual(
      parseMostLink(null).error,
      'Link must be a non-empty string'
    )
    assert.strictEqual(
      parseMostLink(undefined).error,
      'Link must be a non-empty string'
    )
  })

  it('rejects CID v0', () => {
    const result = parseMostLink(
      'most://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX?filename=a.txt'
    )
    assert.strictEqual(result.error, 'Invalid CID format: CID v1 required')
  })
})
