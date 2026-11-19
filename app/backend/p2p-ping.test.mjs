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
          '77de90f010098e4f2e16de56465d838a267c422e98a54613db92af1161a3f066',
        joinToHost:
          '14d313d1297de73221c9df1d307c5c7ee192d0670c11ea43c8a555b3fa967c3e',
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
