import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateCidString, parseMostLink } from '../../src/core/cid.js'

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

  it('rejects CID v0 (does not start with b)', () => {
    const result = validateCidString('QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX')
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'Invalid CID format: CID v1 must start with "b"')
  })

  it('accepts valid CID v1 with bafkreid prefix', () => {
    assert.strictEqual(validateCidString('bafkreid').valid, true)
  })

  it('accepts valid CID v1 with longer hash', () => {
    assert.strictEqual(validateCidString('bafkreidye2j2fjw4kj3wlJNN4k3qQ').valid, true)
  })

  it('accepts CID with numbers', () => {
    assert.strictEqual(validateCidString('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi').valid, true)
  })
})

describe('parseMostLink', () => {
  it('extracts CID from most:// link', () => {
    const result = parseMostLink('most://bafkreidye2j2fjw4kj3wlJNN4k3qQ')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
    assert.strictEqual(result.error, undefined)
  })

  it('handles CID without most:// prefix', () => {
    const result = parseMostLink('bafkreidye2j2fjw4kj3wlJNN4k3qQ')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
    assert.strictEqual(result.error, undefined)
  })

  it('strips trailing slashes', () => {
    const result = parseMostLink('most://bafkreidye2j2fjw4kj3wlJNN4k3qQ///')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
  })

  it('strips single trailing slash', () => {
    const result = parseMostLink('most://bafkreidye2j2fjw4kj3wlJNN4k3qQ/')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
  })

  it('strips extra path components', () => {
    const result = parseMostLink('most://bafkreidye2j2fjw4kj3wlJNN4k3qQ/some/path')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
  })

  it('strips query string', () => {
    const result = parseMostLink('most://bafkreidye2j2fjw4kj3wlJNN4k3qQ?foo=bar')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
  })

  it('rejects invalid CID format', () => {
    const result = parseMostLink('most://invalid')
    assert.strictEqual(result.cid, '')
    assert.strictEqual(result.error, 'Invalid CID format: CID v1 must start with "b"')
  })

  it('rejects null/undefined', () => {
    assert.strictEqual(parseMostLink(null).error, 'Link must be a non-empty string')
    assert.strictEqual(parseMostLink(undefined).error, 'Link must be a non-empty string')
  })

  it('trims whitespace inside CID', () => {
    const result = parseMostLink('most://  bafkreidye2j2fjw4kj3wlJNN4k3qQ  ')
    assert.strictEqual(result.cid, 'bafkreidye2j2fjw4kj3wlJNN4k3qQ')
  })

  it('handles CID v0 with conversion attempt', () => {
    const result = parseMostLink('most://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX')
    assert.strictEqual(result.error, 'Invalid CID format: CID v1 must start with "b"')
  })
})