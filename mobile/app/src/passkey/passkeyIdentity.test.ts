import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  createPasskeyIdentity,
  derivePasskeyDanger,
  getPasskeyPrfInput,
  verifyPasskeyIdentity,
} from './passkeyIdentity'

const FIXED_PRF_OUTPUT = Uint8Array.from({ length: 32 }, (_, index) => index)

describe('mobile passkey identity', () => {
  it('matches the shared passkey golden sample', async () => {
    assert.equal(
      Buffer.from(getPasskeyPrfInput()).toString('hex'),
      'dd0b5cdd3090bcf317863941e3d1455f07b1a3e7cba102d346b8a49f5d3beecb'
    )
    assert.equal(
      derivePasskeyDanger(FIXED_PRF_OUTPUT),
      '0xdc6653576c9fad802e06c6986b2190be2d2570eb3791a94a9e1a087919a96795'
    )
    const identity = createPasskeyIdentity(FIXED_PRF_OUTPUT)
    assert.equal(identity.address, '0x317f2630a7F7D52D192324d337339036FAfb4a84')
    assert.equal((await verifyPasskeyIdentity(identity)).verified, true)
  })

  it('separates different PRF outputs', () => {
    assert.notEqual(
      createPasskeyIdentity(FIXED_PRF_OUTPUT).address,
      createPasskeyIdentity(new Uint8Array(32).fill(9)).address
    )
  })
})
