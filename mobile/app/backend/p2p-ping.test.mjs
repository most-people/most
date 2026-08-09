import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createP2PPingFrameDecoder,
  deriveP2PPingTopic,
  generateP2PPingCode,
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
    assert.equal(
      deriveP2PPingTopic('000042').toString('hex'),
      '76181be378cb3cdeb40c42254fb657e576699291c53ae3add926c5c051d2b19a'
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
