import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  consumePasskeyBridgeCallback,
  createPasskeyBridgeCallback,
  createPasskeyBridgeRequest,
} from './passkeyBridge'

const DANGER =
  '0xdc6653576c9fad802e06c6986b2190be2d2570eb3791a94a9e1a087919a96795'
const CREDENTIAL_ID = '0x00112233445566778899aabbccddeeff'
const DIFFERENT_STATE = `0x${'ff'.repeat(32)}`

function createRoundTrip() {
  const pending = createPasskeyBridgeRequest()
  const callback = createPasskeyBridgeCallback({
    state: pending.state,
    recipientPublicKey: pending.recipientPublicKey,
    danger: DANGER,
    credentialId: CREDENTIAL_ID,
  })
  return { pending, callback }
}

describe('mobile passkey bridge', () => {
  it('encrypts and decrypts a callback without exposing the seed', () => {
    const { pending, callback } = createRoundTrip()
    assert.equal(callback.includes(DANGER), false)
    assert.deepEqual(consumePasskeyBridgeCallback(callback, pending), {
      danger: DANGER,
      credentialId: CREDENTIAL_ID,
    })
  })

  it('rejects tampering, wrong state, expiry, and replay', () => {
    const changedState = createRoundTrip()
    const changedUrl = new URL(changedState.callback)
    changedUrl.searchParams.set('state', DIFFERENT_STATE)
    assert.throws(
      () =>
        consumePasskeyBridgeCallback(
          changedUrl.toString(),
          changedState.pending
        ),
      /PASSKEY_BRIDGE_INVALID_CALLBACK/
    )

    const expired = createRoundTrip()
    assert.throws(
      () =>
        consumePasskeyBridgeCallback(
          expired.callback,
          expired.pending,
          expired.pending.createdAt + 300_001
        ),
      /PASSKEY_BRIDGE_EXPIRED/
    )

    const replay = createRoundTrip()
    consumePasskeyBridgeCallback(replay.callback, replay.pending)
    assert.throws(
      () => consumePasskeyBridgeCallback(replay.callback, replay.pending),
      /PASSKEY_BRIDGE_REPLAYED/
    )
  })
})
