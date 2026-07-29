import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAuthHeaders,
  createLoginIdentity,
  getAccountAvatarUrl,
  most25519,
  mostBoxDecrypt,
  mostBoxEncrypt,
} from '../../../packages/account/src/index.js'
import { verifyAuthHeader } from '../../src/utils/auth.js'

describe('@mostbox/account public entry', () => {
  it('preserves the current deterministic identity and request signature', async () => {
    const identity = createLoginIdentity('alice', 'secret')
    assert.strictEqual(
      identity.address,
      '0x5Acca5E3945c8688bA6567E5598d19A6088761a5'
    )

    const headers = await buildAuthHeaders(identity, 'POST', '/api/channels')
    assert.deepStrictEqual(
      verifyAuthHeader(headers.Authorization, 'POST', '/api/channels').ok,
      true
    )
    assert.strictEqual(
      getAccountAvatarUrl(identity.address),
      `https://api.most.box/avatar/${identity.address.toLowerCase()}`
    )
  })

  it('encrypts a private payload for only the intended recipient', () => {
    const alice = most25519(createLoginIdentity('alice', 'secret').danger)
    const bob = most25519(createLoginIdentity('bob', 'secret').danger)
    const carol = most25519(createLoginIdentity('carol', 'secret').danger)
    const encrypted = mostBoxEncrypt('private-hand', {
      senderPrivateKey: alice.private_key,
      recipientPublicKey: bob.public_key,
    })

    assert.strictEqual(
      mostBoxDecrypt(encrypted, {
        senderPublicKey: alice.public_key,
        recipientPrivateKey: bob.private_key,
      }),
      'private-hand'
    )
    assert.strictEqual(
      mostBoxDecrypt(encrypted, {
        senderPublicKey: alice.public_key,
        recipientPrivateKey: carol.private_key,
      }),
      ''
    )
  })
})
