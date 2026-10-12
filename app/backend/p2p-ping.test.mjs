import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createP2PPingFrameDecoder,
  deriveP2PPingTopic,
  generateP2PPingCode,
  P2P_PING_DIRECTIONS,
  validateP2PPingCode,
} from './p2p-ping.mjs'

function fixedRandomBytes(size) {
  const bytes = Buffer.alloc(size)
  if (size === 4) bytes.writeUInt32BE(42)
  return bytes
}

describe('mobile P2P Ping protocol', () => {
  it('keeps six-digit codes and the desktop topic golden sample identical', () => {
    assert.equal(generateP2PPingCode(fixedRandomBytes), '000042')
    assert.equal(validateP2PPingCode('000042'), '000042')
    assert.deepEqual(
      Object.fromEntries(
        P2P_PING_DIRECTIONS.map(direction => [
          direction,
          deriveP2PPingTopic('000042', direction).toString('hex'),
        ])
      ),
      {
        hostToJoin:
          '595b7f72e315d0c570af73109bcd8b33a2cbd6cb38f2f8382c3afc0d1689abab',
        joinToHost:
          'c3c6d17566c66a652ffdba88ed5768c5a3c83dc9bf30d87565d522e0d1ec83c9',
      }
    )
    assert.throws(() => validateP2PPingCode('00a042'), {
      code: 'VALIDATION_ERROR',
    })
  })

  it('rejects invalid framed input', () => {
    const errors = []
    const decode = createP2PPingFrameDecoder(
      () => {},
      error => errors.push(error)
    )
    decode('{}\n')
    assert.equal(errors.length, 0)
    decode('{bad-json}\n')
    assert.equal(errors.length, 1)
  })
})
