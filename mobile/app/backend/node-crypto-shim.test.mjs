import assert from 'node:assert/strict'
import { createHmac as createNodeHmac } from 'node:crypto'
import test from 'node:test'
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from './node-crypto-shim.mjs'

test('createHmac matches Node.js HMAC-SHA256', () => {
  const key = 'mostbox-mobile-channel-proof-key'
  const chunks = ['mostbox-channel-proof-v1', '\0', 'payload']
  const expected = chunks
    .reduce((hmac, chunk) => hmac.update(chunk), createNodeHmac('sha256', key))
    .digest('hex')
  const actual = chunks
    .reduce((hmac, chunk) => hmac.update(chunk), createHmac('sha256', key))
    .digest('hex')

  assert.equal(actual, expected)
})

test('randomBytes and timingSafeEqual expose the required Node.js behavior', () => {
  const first = randomBytes(32)
  const copy = Buffer.from(first)

  assert.equal(first.length, 32)
  assert.equal(timingSafeEqual(first, copy), true)
  copy[0] ^= 0xff
  assert.equal(timingSafeEqual(first, copy), false)
  assert.throws(() => timingSafeEqual(first, Buffer.alloc(31)), RangeError)
})
