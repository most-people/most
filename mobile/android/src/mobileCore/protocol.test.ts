import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMostLink,
  createProtocolSummary,
  getHyperdriveCidPath,
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
  })

  it('uses CID as file name when filename is omitted', () => {
    const parsed = parseMostLink(`most://${VALID_CID}`)
    assert.equal(parsed.cid, VALID_CID)
    assert.equal(parsed.fileName, VALID_CID)
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

  it('rejects unsupported query parameters and extra paths', () => {
    assert.throws(
      () => parseMostLink(`most://${VALID_CID}?filename=a.txt&foo=bar`),
      /只支持 filename/
    )
    assert.throws(() => parseMostLink(`most://${VALID_CID}/extra`), /额外路径/)
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
