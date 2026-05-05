import { describe, it } from 'node:test'
import assert from 'node:assert'
import { avatar, formatTime, getEdKeyPair, getIPNS } from '../../src/utils/mp.js'

describe('avatar', () => {
  it('returns avatar URL for valid address', () => {
    const url = avatar('0x1234567890abcdef1234567890abcdef12345678')
    assert.ok(typeof url === 'string')
    assert.ok(url.length > 0)
  })
})

describe('formatTime', () => {
  it('formats recent timestamps as relative', () => {
    const now = Date.now()
    const result = formatTime(now - 30000)
    assert.strictEqual(typeof result, 'string')
    assert.ok(result.length > 0)
  })

  it('formats old timestamps as date', () => {
    const old = Date.now() - 86400000 * 365
    const result = formatTime(old)
    assert.strictEqual(typeof result, 'string')
    assert.ok(result.length > 0)
  })
})

describe('getIPNS', () => {
  it('generates valid IPNS key from seed', () => {
    const privateKey = '0x' + 'ab'.repeat(32)
    const edPublicKey = '0x' + 'cd'.repeat(32)
    const ipns = getIPNS(privateKey, edPublicKey)
    assert.strictEqual(typeof ipns, 'string')
    assert.ok(ipns.length > 0)
    assert.ok(ipns.startsWith('k'))
  })

  it('produces consistent IPNS from same seed', () => {
    const privateKey = '0x' + 'ab'.repeat(32)
    const edPublicKey = '0x' + 'cd'.repeat(32)
    const i1 = getIPNS(privateKey, edPublicKey)
    const i2 = getIPNS(privateKey, edPublicKey)
    assert.strictEqual(i1, i2)
  })
})

describe('getEdKeyPair', () => {
  it('generates Ed25519 key pair', () => {
    const privateKey = '0x' + 'ab'.repeat(32)
    const edPublicKey = '0x' + 'cd'.repeat(32)
    const keys = getEdKeyPair(privateKey, edPublicKey)
    assert.ok(keys.publicKey)
    assert.ok(keys.secretKey)
  })

  it('produces consistent keys from same seed', () => {
    const privateKey = '0x' + 'ab'.repeat(32)
    const edPublicKey = '0x' + 'cd'.repeat(32)
    const k1 = getEdKeyPair(privateKey, edPublicKey)
    const k2 = getEdKeyPair(privateKey, edPublicKey)
    assert.deepStrictEqual(k1, k2)
  })
})
