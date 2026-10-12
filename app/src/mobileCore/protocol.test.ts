import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMostLink,
  createProtocolSummary,
  getHyperdriveCidPath,
  hasExplicitMostLinkFilename,
  MOST_LINK_ERROR_CODES,
  parseIncomingMostLink,
  parseMostLink,
} from './protocol'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

describe('mobile most link protocol', () => {
  it('builds and parses most links', () => {
    const link = buildMostLink(VALID_CID, 'hello world.txt')
    assert.equal(
      link,
      `most://${VALID_CID}?filename=${encodeURIComponent('hello world.txt')}`
    )

    const parsed = parseMostLink(link)
    assert.equal(parsed.cid, VALID_CID)
    assert.equal(parsed.fileName, 'hello world.txt')
    assert.equal(hasExplicitMostLinkFilename(link), true)
  })

  it('uses CID as file name when filename is omitted', () => {
    for (const link of [`most://${VALID_CID}`, VALID_CID]) {
      const parsed = parseMostLink(link)
      assert.equal(parsed.cid, VALID_CID)
      assert.equal(parsed.fileName, VALID_CID)
    }
    assert.equal(hasExplicitMostLinkFilename(`most://${VALID_CID}`), false)
    assert.equal(
      hasExplicitMostLinkFilename(`most://${VALID_CID}?filename=%20`),
      false
    )
  })

  it('parses web entry links and bare CID inputs like the desktop client', () => {
    const fileName = 'phone file.txt'
    const encodedFileName = encodeURIComponent(fileName)
    const inputs = [
      `https://most.box/cid/${VALID_CID}?filename=${encodedFileName}`,
      `http://localhost:3000/cid/${VALID_CID}/?filename=${encodedFileName}`,
      `${VALID_CID}?filename=${encodedFileName}`,
      `${VALID_CID}/?filename=${encodedFileName}`,
      `https://example.com/share/${VALID_CID}?filename=${encodedFileName}`,
    ]

    for (const input of inputs) {
      assert.deepEqual(parseMostLink(input), {
        cid: VALID_CID,
        fileName,
      })
      assert.equal(hasExplicitMostLinkFilename(input), true)
    }
  })

  it('parses links when URLSearchParams.keys is unavailable', () => {
    const originalKeys = URLSearchParams.prototype.keys
    Object.defineProperty(URLSearchParams.prototype, 'keys', {
      configurable: true,
      value: undefined,
    })

    try {
      const parsed = parseMostLink(buildMostLink(VALID_CID, 'android file.txt'))
      assert.equal(parsed.cid, VALID_CID)
      assert.equal(parsed.fileName, 'android file.txt')
    } finally {
      Object.defineProperty(URLSearchParams.prototype, 'keys', {
        configurable: true,
        value: originalKeys,
      })
    }
  })

  it('rejects unsupported query parameters and invalid CID tails', () => {
    assert.throws(
      () => parseMostLink(`most://${VALID_CID}?filename=a.txt&foo=bar`),
      new Error(MOST_LINK_ERROR_CODES.unsupportedQuery)
    )
    assert.throws(
      () => parseMostLink(`most://${VALID_CID}/extra`),
      new Error(MOST_LINK_ERROR_CODES.invalidCid)
    )
    assert.throws(
      () => parseMostLink(`most://${VALID_CID}///`),
      new Error(MOST_LINK_ERROR_CODES.invalidCid)
    )
  })

  it('accepts native most link intents and ignores unrelated app URLs', () => {
    const link = buildMostLink(VALID_CID, 'phone file.txt')
    assert.deepEqual(parseIncomingMostLink(`  ${link}  `), {
      link,
      cid: VALID_CID,
      fileName: 'phone file.txt',
    })
    assert.equal(parseIncomingMostLink(null), null)
    assert.equal(
      parseIncomingMostLink('exp+mostbox-android://expo-development-client'),
      null
    )
    assert.equal(parseIncomingMostLink('https://most.box/download'), null)
  })

  it('rejects malformed native most link intents', () => {
    assert.throws(
      () => parseIncomingMostLink('most://not-a-cid?filename=a.txt'),
      new Error(MOST_LINK_ERROR_CODES.invalidCid)
    )
  })

  it('derives protocol paths and topic digest details from CID', () => {
    assert.equal(getHyperdriveCidPath(VALID_CID), `/${VALID_CID}`)
    assert.deepEqual(createProtocolSummary(VALID_CID), {
      cid: VALID_CID,
      drivePath: `/${VALID_CID}`,
      topicDigestBytes: 32,
    })
  })
})
