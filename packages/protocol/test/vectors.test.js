import { describe, expect, it } from 'vitest'

import {
  GOLDEN_ACCOUNTS,
  GOLDEN_AUTH_MESSAGES,
  GOLDEN_DRIVE_NAME,
  GOLDEN_TOPIC_BYTES,
  GOLDEN_TOPIC_HEX,
  LINK_CASES,
  LINK_ERROR_CASES,
  VALID_CID,
} from './vectors.js'

import {
  MOST_LINK_ERROR_CODES,
  buildAuthMessage,
  buildMostLink,
  getCidInfo,
  mostMnemonic,
  mostSignMessage,
  mostWallet,
  normalizeAuthPath,
  normalizeAddress,
  parseMostLink,
  validateCidString,
} from '../src/index.js'

/**
 * Cross-runtime golden vectors.
 *
 * Any runtime that fails one of these has diverged from the content-identity
 * contract. The same vectors are consumed by the desktop and mobile suites.
 */
describe('most link golden vectors', () => {
  it.each(LINK_CASES)('parses $input', ({ input, cid, fileName }) => {
    expect(parseMostLink(input)).toEqual({ cid, fileName })
  })

  it.each(LINK_ERROR_CASES)(
    'rejects $input with $errorCode',
    ({ input, errorCode, details }) => {
      const parsed = parseMostLink(input)
      expect(parsed.errorCode).toBe(errorCode)
      if (details) {
        expect(parsed.details).toEqual(details)
      }
    }
  )

  it('never reports a success shape for an error case', () => {
    for (const { input } of LINK_ERROR_CASES) {
      const parsed = parseMostLink(input)
      expect(parsed.errorCode).toBeTruthy()
    }
  })

  it('uses the same error code table on every runtime', () => {
    expect(MOST_LINK_ERROR_CODES).toEqual({
      CID_EMPTY: 'cid_empty',
      INVALID_CID_FORMAT: 'invalid_cid_format',
      CID_V1_REQUIRED: 'cid_v1_required',
      CID_DIGEST_LENGTH: 'cid_digest_length',
      LINK_EMPTY: 'link_empty',
      INVALID_URL: 'invalid_url',
      INVALID_PROTOCOL: 'invalid_protocol',
      UNSUPPORTED_PATH: 'unsupported_path',
      UNSUPPORTED_QUERY_PARAM: 'unsupported_query_param',
    })
  })
})

describe('cid topic golden vectors', () => {
  it('derives the topic from the multihash digest with no extra hashing', () => {
    const info = getCidInfo(VALID_CID)
    expect(info.topicHex).toBe(GOLDEN_TOPIC_HEX)
    expect(Array.from(info.topic)).toEqual(GOLDEN_TOPIC_BYTES)
    expect(info.driveName).toBe(GOLDEN_DRIVE_NAME)
  })

  it('exposes the topic as a plain Uint8Array so Bare can use it', () => {
    const info = getCidInfo(VALID_CID)
    expect(info.topic).toBeInstanceOf(Uint8Array)
    // A Buffer would also be a Uint8Array, so assert the constructor name to
    // keep this package free of Node-only types.
    expect(info.topic.constructor.name).toBe('Uint8Array')
    expect(info.topic.byteLength).toBe(32)
  })

  it('throws a validation error carrying the canonical error code', () => {
    expect(() => getCidInfo('notacid')).toThrowError(
      expect.objectContaining({ errorCode: 'invalid_cid_format' })
    )
    expect(() => getCidInfo('')).toThrowError(
      expect.objectContaining({ errorCode: 'cid_empty' })
    )
  })

  it('lets the caller supply its own ValidationError factory', () => {
    class ValidationError extends Error {
      constructor(message, errorCode) {
        super(message)
        this.name = 'ValidationError'
        this.code = 'VALIDATION_ERROR'
        this.errorCode = errorCode
      }
    }

    try {
      getCidInfo('notacid', {
        createValidationError: (message, errorCode) =>
          new ValidationError(message, errorCode),
      })
      throw new Error('expected getCidInfo to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.errorCode).toBe('invalid_cid_format')
    }
  })

  it('produces an independent topic array per call', () => {
    const first = getCidInfo(VALID_CID).topic
    first[0] = 0
    expect(getCidInfo(VALID_CID).topic[0]).toBe(GOLDEN_TOPIC_BYTES[0])
  })
})

describe('account derivation golden vectors', () => {
  it.each(GOLDEN_ACCOUNTS)(
    'derives the same address for $username',
    ({ username, password, address }) => {
      expect(mostWallet(username, password).address).toBe(address)
    }
  )

  it('keeps the recorded danger hex stable', () => {
    expect(mostWallet('quickstart', 'quickstart').danger).toBe(
      GOLDEN_ACCOUNTS[0].danger
    )
  })

  it('derives a 24 word mnemonic from the seed', () => {
    const { danger } = mostWallet('quickstart', 'quickstart')
    const mnemonic = mostMnemonic(danger)
    expect(mnemonic.split(' ')).toHaveLength(24)
    expect(mostMnemonic(danger)).toBe(mnemonic)
  })

  it('signs a message with the derived account address', async () => {
    const { danger, address } = mostWallet('quickstart', 'quickstart')
    const signed = await mostSignMessage(danger, 'hello')
    expect(signed.address).toBe(address)
    expect(signed.signature).toMatch(/^0x[0-9a-f]+$/)
  })

  it('rejects out of range pbkdf2 iteration counts', () => {
    for (const iterations of [0, -1, 1_000_001, 1.5, Number.NaN]) {
      expect(() => mostWallet('a', 'b', iterations)).toThrowError(RangeError)
    }
  })

  it('honours an explicit iteration count', () => {
    const fast = mostWallet('quickstart', 'quickstart', 1)
    expect(fast.address).not.toBe(GOLDEN_ACCOUNTS[0].address)
  })
})

describe('auth message golden vectors', () => {
  it.each(GOLDEN_AUTH_MESSAGES)(
    'builds $expected',
    ({ timestamp, method, path, expected }) => {
      expect(buildAuthMessage(timestamp, method, path)).toBe(expected)
    }
  )

  it('strips the query string and origin from the signed path', () => {
    expect(normalizeAuthPath('/api/files/abc/download?x=1')).toBe(
      '/api/files/abc/download'
    )
    expect(normalizeAuthPath('https://most.box/ws')).toBe('/ws')
    expect(normalizeAuthPath('')).toBe('/')
  })

  it('treats a missing method as GET', () => {
    expect(buildAuthMessage('1', '', '/ws')).toBe('1:GET:/ws')
  })

  it('normalizes owner addresses', () => {
    expect(normalizeAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01')).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01'
    )
    expect(normalizeAddress('not-an-address')).toBe('')
    expect(normalizeAddress(undefined)).toBe('')
  })
})

describe('link building', () => {
  it('round trips a file name through parseMostLink', () => {
    const link = buildMostLink(VALID_CID, '报告 2026.pdf')
    expect(link).toBe(
      `most://${VALID_CID}?filename=${encodeURIComponent('报告 2026.pdf')}`
    )
    expect(parseMostLink(link).fileName).toBe('报告 2026.pdf')
  })

  it('omits the query when the file name is blank', () => {
    expect(buildMostLink(VALID_CID, '   ')).toBe(`most://${VALID_CID}`)
    expect(buildMostLink(VALID_CID, undefined)).toBe(`most://${VALID_CID}`)
  })

  it('trims the file name', () => {
    expect(buildMostLink(VALID_CID, '  a.bin  ')).toBe(
      `most://${VALID_CID}?filename=a.bin`
    )
  })
})

describe('cid validation', () => {
  it('accepts a v1 cid with a 32 byte digest', () => {
    expect(validateCidString(VALID_CID)).toEqual({ valid: true })
  })

  it('reports the canonical error code for each failure mode', () => {
    expect(validateCidString('')).toEqual({
      valid: false,
      errorCode: 'cid_empty',
    })
    expect(validateCidString(null)).toEqual({
      valid: false,
      errorCode: 'cid_empty',
    })
    expect(validateCidString('nope')).toEqual({
      valid: false,
      errorCode: 'invalid_cid_format',
    })
  })
})
