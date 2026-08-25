import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  createPasskeyIdentity,
  derivePasskeyDanger,
  getPasskeyPrfInput,
  verifyPasskeyIdentity,
} from '../../src/utils/passkeyIdentity.js'

const FIXED_PRF_OUTPUT = Uint8Array.from({ length: 32 }, (_, index) => index)

describe('passkey identity derivation', () => {
  it('matches the fixed PRF and HKDF golden samples', () => {
    assert.equal(
      Buffer.from(getPasskeyPrfInput()).toString('hex'),
      'dd0b5cdd3090bcf317863941e3d1455f07b1a3e7cba102d346b8a49f5d3beecb'
    )
    assert.equal(
      derivePasskeyDanger(FIXED_PRF_OUTPUT),
      '0xdc6653576c9fad802e06c6986b2190be2d2570eb3791a94a9e1a087919a96795'
    )
    assert.deepEqual(createPasskeyIdentity(FIXED_PRF_OUTPUT), {
      username: 'Passkey#4a84',
      address: '0x317f2630a7F7D52D192324d337339036FAfb4a84',
      danger:
        '0xdc6653576c9fad802e06c6986b2190be2d2570eb3791a94a9e1a087919a96795',
    })
  })

  it('keeps the same input stable and separates different PRF outputs', () => {
    const first = createPasskeyIdentity(FIXED_PRF_OUTPUT)
    const repeated = createPasskeyIdentity(FIXED_PRF_OUTPUT)
    const different = createPasskeyIdentity(new Uint8Array(32).fill(7))

    assert.equal(repeated.address, first.address)
    assert.notEqual(different.address, first.address)
    assert.notEqual(different.danger, first.danger)
  })

  it('signs the fixed test message and recovers the derived address', async () => {
    const identity = createPasskeyIdentity(FIXED_PRF_OUTPUT)
    const proof = await verifyPasskeyIdentity(identity)

    assert.equal(proof.verified, true)
    assert.equal(proof.recoveredAddress, identity.address)
  })

  it('rejects missing or incorrectly sized PRF output', () => {
    assert.throws(() => derivePasskeyDanger(new Uint8Array(31)), /32 bytes/)
    assert.throws(() => derivePasskeyDanger(new Uint8Array(33)), /32 bytes/)
  })
})
