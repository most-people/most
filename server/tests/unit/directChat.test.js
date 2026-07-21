import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildDirectChannelId,
  buildDirectInboxChannelId,
  createDirectKeyEnvelope,
  decryptDirectMessage,
  decryptDirectVoiceEvent,
  DIRECT_MESSAGE_MAX_CIPHERTEXT_LENGTH,
  DIRECT_MESSAGE_MAX_LENGTH,
  encryptDirectMessage,
  encryptDirectVoiceEvent,
  isDirectSystemChannel,
  verifyDirectKeyEnvelope,
} from '../../src/core/directChat.js'
import { most25519, mostWallet } from '../../src/utils/mostWallet.js'

function identity(username, password) {
  const wallet = mostWallet(username, password)
  return { ...wallet, displayName: username }
}

describe('direct chat protocol', () => {
  it('builds stable hidden channel IDs from addresses', () => {
    const alice = identity('alice', 'one')
    const bob = identity('bob', 'two')
    const direct = buildDirectChannelId(alice.address, bob.address)
    const reversed = buildDirectChannelId(bob.address, alice.address)
    const inbox = buildDirectInboxChannelId(alice.address)

    assert.strictEqual(direct, reversed)
    assert.match(direct, /^direct\.[a-f0-9]{64}$/)
    assert.match(inbox, /^direct-inbox\.[a-f0-9]{40}$/)
    assert.ok(isDirectSystemChannel(direct, 'direct'))
    assert.ok(isDirectSystemChannel(inbox, 'direct-inbox'))
  })

  it('verifies that an exchanged X25519 key belongs to the address', async () => {
    const alice = identity('alice', 'one')
    const bob = identity('bob', 'two')
    const envelope = await createDirectKeyEnvelope(alice, bob.address)

    assert.deepStrictEqual(
      verifyDirectKeyEnvelope(JSON.stringify(envelope), bob.address),
      envelope
    )
    assert.strictEqual(
      verifyDirectKeyEnvelope(
        JSON.stringify({
          ...envelope,
          publicKey: most25519(bob.danger).public_key,
        }),
        bob.address
      ),
      null
    )
    assert.strictEqual(
      verifyDirectKeyEnvelope(
        JSON.stringify({ ...envelope, displayName: 'Mallory' }),
        bob.address
      ),
      null
    )
    assert.strictEqual(verifyDirectKeyEnvelope(envelope, alice.address), null)
  })

  it('keeps message plaintext readable only by the two endpoints', () => {
    const alice = identity('alice', 'one')
    const bob = identity('bob', 'two')
    const eve = identity('eve', 'three')
    const bobPublicKey = most25519(bob.danger).public_key
    const alicePublicKey = most25519(alice.danger).public_key
    const ciphertext = encryptDirectMessage(
      'private hello',
      alice,
      bobPublicKey
    )

    assert.ok(ciphertext)
    assert.ok(!ciphertext.includes('private hello'))
    assert.strictEqual(
      decryptDirectMessage(ciphertext, {
        identity: bob,
        peerPublicKey: alicePublicKey,
        authorAddress: alice.address,
      }),
      'private hello'
    )
    assert.strictEqual(
      decryptDirectMessage(ciphertext, {
        identity: alice,
        peerPublicKey: bobPublicKey,
        authorAddress: alice.address,
      }),
      'private hello'
    )
    assert.strictEqual(
      decryptDirectMessage(ciphertext, {
        identity: eve,
        peerPublicKey: alicePublicKey,
        authorAddress: alice.address,
      }),
      ''
    )

    const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`
    assert.strictEqual(
      decryptDirectMessage(tampered, {
        identity: bob,
        peerPublicKey: alicePublicKey,
        authorAddress: alice.address,
      }),
      ''
    )
  })

  it('supports 7000 ASCII, Chinese, or emoji characters within the channel limit', () => {
    const alice = identity('alice', 'one')
    const bob = identity('bob', 'two')
    const bobPublicKey = most25519(bob.danger).public_key

    for (const plaintext of [
      'x'.repeat(DIRECT_MESSAGE_MAX_LENGTH),
      '中'.repeat(DIRECT_MESSAGE_MAX_LENGTH),
      '😀'.repeat(DIRECT_MESSAGE_MAX_LENGTH),
    ]) {
      const ciphertext = encryptDirectMessage(plaintext, alice, bobPublicKey)
      assert.ok(ciphertext.length <= DIRECT_MESSAGE_MAX_CIPHERTEXT_LENGTH)
      assert.strictEqual(
        decryptDirectMessage(ciphertext, {
          identity: alice,
          peerPublicKey: bobPublicKey,
          authorAddress: alice.address,
        }),
        plaintext
      )
    }
    assert.throws(
      () =>
        encryptDirectMessage(
          '😀'.repeat(DIRECT_MESSAGE_MAX_LENGTH + 1),
          alice,
          bobPublicKey
        ),
      /too long/
    )
  })

  it('encrypts and authenticates direct voice event envelopes', () => {
    const alice = identity('alice', 'one')
    const bob = identity('bob', 'two')
    const eve = identity('eve', 'three')
    const alicePublicKey = most25519(alice.danger).public_key
    const bobPublicKey = most25519(bob.danger).public_key
    const payload = {
      event: 'signal',
      sessionId: 'voice-alice',
      targetSessionId: 'voice-bob',
      sender: { address: alice.address },
      signal: { type: 'offer', sdp: 'v=0\r\n' },
      timestamp: Date.now(),
    }
    const ciphertext = encryptDirectVoiceEvent(payload, alice, bobPublicKey)

    assert.ok(ciphertext)
    assert.ok(!ciphertext.includes('voice-alice'))
    assert.deepStrictEqual(
      decryptDirectVoiceEvent(ciphertext, {
        identity: bob,
        peerPublicKey: alicePublicKey,
        authorAddress: alice.address,
      }),
      payload
    )
    assert.strictEqual(
      decryptDirectVoiceEvent(ciphertext, {
        identity: eve,
        peerPublicKey: alicePublicKey,
        authorAddress: alice.address,
      }),
      null
    )
  })
})
