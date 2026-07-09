import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as dagPb from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import {
  MOST_LINK_ERROR_CODES,
  calculateDirectoryCid,
  validateCidString,
  parseMostLink,
  buildMostLink,
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

function webTailLink(fileName = 'a.txt') {
  return `https://most.box/cid/${VALID_CID}?filename=${encodeURIComponent(fileName)}`
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

  it('extracts CID and filename from web entry links', () => {
    const result = parseMostLink(webTailLink())
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, 'a.txt')
    assert.strictEqual(result.errorCode, undefined)
    assert.strictEqual(Object.hasOwn(result, 'error'), false)
  })

  it('extracts CID from bare CID input', () => {
    const result = parseMostLink(VALID_CID)
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, VALID_CID)
    assert.strictEqual(result.errorCode, undefined)
  })

  it('extracts CID and filename from bare CID input with filename query', () => {
    const result = parseMostLink(
      `${VALID_CID}?filename=${encodeURIComponent('bare.txt')}`
    )
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, 'bare.txt')
    assert.strictEqual(result.errorCode, undefined)
  })

  it('accepts arbitrary prefixes when the tail is a CID target', () => {
    const result = parseMostLink(`https://example.com/share/${VALID_CID}`)
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, VALID_CID)
    assert.strictEqual(result.errorCode, undefined)
  })

  it('rejects trailing slashes without a CID tail', () => {
    assertInvalidLink(
      `most://${VALID_CID}///`,
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT
    )
  })

  it('rejects extra path components after the CID tail', () => {
    assertInvalidLink(
      `most://${VALID_CID}/some/path`,
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT
    )
  })

  it('uses CID as filename when filename is omitted', () => {
    const result = parseMostLink(`most://${VALID_CID}`)
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, VALID_CID)
    assert.strictEqual(result.errorCode, undefined)
  })

  it('uses CID as filename when filename is blank', () => {
    const result = parseMostLink(`most://${VALID_CID}?filename=%20%20`)
    assert.strictEqual(result.cid, VALID_CID)
    assert.strictEqual(result.fileName, VALID_CID)
    assert.strictEqual(result.errorCode, undefined)
  })

  it('rejects unsupported query parameters', () => {
    const result = assertInvalidLink(
      `most://${VALID_CID}?filename=a.txt&foo=bar`,
      MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM
    )
    assert.deepStrictEqual(result.details, { param: 'foo' })
  })

  it('rejects unsupported query parameters from web entry links', () => {
    const result = assertInvalidLink(
      `https://most.box/cid/${VALID_CID}?filename=a.txt&foo=bar`,
      MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM
    )
    assert.deepStrictEqual(result.details, { param: 'foo' })
  })

  it('rejects invalid CID format', () => {
    assertInvalidLink(
      'most://invalid',
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT
    )
    assertInvalidLink(
      'https://example.com/file',
      MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT
    )
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

describe('buildMostLink', () => {
  it('omits filename query when no filename is provided', () => {
    assert.strictEqual(buildMostLink(VALID_CID), `most://${VALID_CID}`)
    assert.strictEqual(buildMostLink(VALID_CID, '  '), `most://${VALID_CID}`)
  })

  it('keeps explicit filenames encoded', () => {
    assert.strictEqual(
      buildMostLink(VALID_CID, '测试 文件.txt'),
      `most://${VALID_CID}?filename=${encodeURIComponent('测试 文件.txt')}`
    )
  })
})

describe('calculateDirectoryCid', () => {
  it('creates a standard UnixFS directory root with child file links', async () => {
    const result = await calculateDirectoryCid([
      { path: 'Show/S01E01.txt', content: Buffer.from('episode 1') },
      { path: 'Show/S01E02.txt', content: Buffer.from('episode 2') },
    ])

    assert.strictEqual(result.rootPath, 'Show')
    assert.strictEqual(result.cid.code, 0x70)
    assert.strictEqual(result.files.length, 2)
    assert.deepStrictEqual(
      result.files.map(file => file.path),
      ['S01E01.txt', 'S01E02.txt']
    )

    const rootBlock = result.blocks.get(result.cid.toString())
    const rootNode = dagPb.decode(rootBlock)
    const rootUnixfs = UnixFS.unmarshal(rootNode.Data)

    assert.strictEqual(rootUnixfs.type, 'directory')
    assert.strictEqual(rootUnixfs.isDirectory(), true)
    assert.deepStrictEqual(
      rootNode.Links.map(link => link.Name),
      ['S01E01.txt', 'S01E02.txt']
    )
  })

  it('keeps the directory CID stable for the same paths and contents', async () => {
    const first = await calculateDirectoryCid([
      { path: 'Show/b.txt', content: Buffer.from('b') },
      { path: 'Show/a.txt', content: Buffer.from('a') },
    ])
    const second = await calculateDirectoryCid([
      { path: 'Show/a.txt', content: Buffer.from('a') },
      { path: 'Show/b.txt', content: Buffer.from('b') },
    ])

    assert.strictEqual(first.cid.toString(), second.cid.toString())
  })

  it('changes the directory CID when a child file changes', async () => {
    const first = await calculateDirectoryCid([
      { path: 'Show/S01E01.txt', content: Buffer.from('episode 1') },
    ])
    const second = await calculateDirectoryCid([
      { path: 'Show/S01E01.txt', content: Buffer.from('episode 1 updated') },
    ])

    assert.notStrictEqual(first.cid.toString(), second.cid.toString())
  })

  it('rejects duplicate normalized paths', async () => {
    await assert.rejects(
      calculateDirectoryCid([
        { path: 'Show/S01E01.txt', content: Buffer.from('a') },
        { path: 'Show\\S01E01.txt', content: Buffer.from('b') },
      ]),
      /Duplicate collection path/
    )
  })

  it('rejects path traversal entries', async () => {
    await assert.rejects(
      calculateDirectoryCid([
        { path: 'Show/../secret.txt', content: Buffer.from('nope') },
      ]),
      /Path traversal/
    )
  })
})
