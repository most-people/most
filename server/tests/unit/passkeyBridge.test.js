import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hexlify, randomBytes } from 'ethers'

import {
  consumePasskeyBridgeCallback,
  createPasskeyBridgeCallback,
  createPasskeyBridgeRequest,
  parsePasskeyBridgeCallback,
} from '../../src/utils/passkeyBridge.js'

const DANGER =
  '0xdc6653576c9fad802e06c6986b2190be2d2570eb3791a94a9e1a087919a96795'
const CREDENTIAL_ID = '0x00112233445566778899aabbccddeeff'

function createRoundTrip(now = Date.now()) {
  const pending = createPasskeyBridgeRequest({ now })
  const callback = createPasskeyBridgeCallback({
    state: pending.state,
    recipientPublicKey: pending.recipientPublicKey,
    danger: DANGER,
    credentialId: CREDENTIAL_ID,
  })
  return { pending, callback }
}

describe('passkey native bridge', () => {
  it('encrypts and decrypts a state-bound callback without exposing the seed', () => {
    const { pending, callback } = createRoundTrip()

    assert.equal(callback.includes(DANGER), false)
    assert.equal(callback.includes('danger'), false)
    assert.deepEqual(consumePasskeyBridgeCallback(callback, pending), {
      danger: DANGER,
      credentialId: CREDENTIAL_ID,
    })
  })

  it('rejects token tampering and a wrong recipient key', () => {
    const tamperedRoundTrip = createRoundTrip()
    const tamperedUrl = new URL(tamperedRoundTrip.callback)
    const token = tamperedUrl.searchParams.get('token')
    tamperedUrl.searchParams.set(
      'token',
      `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
    )
    assert.throws(
      () =>
        consumePasskeyBridgeCallback(
          tamperedUrl.toString(),
          tamperedRoundTrip.pending
        ),
      /PASSKEY_BRIDGE_DECRYPT_FAILED/
    )

    const wrongKeyRoundTrip = createRoundTrip()
    const wrongRecipient = createPasskeyBridgeRequest({
      now: wrongKeyRoundTrip.pending.createdAt,
    })
    const wrongPending = {
      ...wrongKeyRoundTrip.pending,
      recipientPrivateKey: wrongRecipient.recipientPrivateKey,
    }
    assert.throws(
      () =>
        consumePasskeyBridgeCallback(wrongKeyRoundTrip.callback, wrongPending),
      /PASSKEY_BRIDGE_DECRYPT_FAILED/
    )
  })

  it('rejects expired state and replayed callbacks', () => {
    const expired = createRoundTrip()
    assert.throws(
      () =>
        consumePasskeyBridgeCallback(expired.callback, expired.pending, {
          now: expired.pending.createdAt + 300_001,
        }),
      /PASSKEY_BRIDGE_EXPIRED/
    )

    const replayed = createRoundTrip()
    consumePasskeyBridgeCallback(replayed.callback, replayed.pending)
    assert.throws(
      () => consumePasskeyBridgeCallback(replayed.callback, replayed.pending),
      /PASSKEY_BRIDGE_REPLAYED/
    )
  })

  it('rejects changed state and malformed callback fields', () => {
    const { pending, callback } = createRoundTrip()
    const changedState = new URL(callback)
    changedState.searchParams.set('state', hexlify(randomBytes(32)))
    assert.throws(
      () => consumePasskeyBridgeCallback(changedState.toString(), pending),
      /PASSKEY_BRIDGE_INVALID_CALLBACK/
    )

    const extraField = new URL(callback)
    extraField.searchParams.set('danger', DANGER)
    assert.equal(parsePasskeyBridgeCallback(extraField.toString()), null)
  })
})
