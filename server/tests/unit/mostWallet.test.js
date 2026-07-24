import { describe, it } from 'node:test'
import assert from 'node:assert'
import { verifyMessage } from 'ethers'
import {
  mostBoxDecrypt,
  mostBoxEncrypt,
  mostDecode,
  mostEncode,
  mostWallet,
  mostMnemonic,
  mostSignMessage,
  most25519,
  parseMostBoxToken,
} from '../../src/utils/mostWallet.js'

describe('mostWallet', () => {
  it('derives consistent address from same credentials', () => {
    const w1 = mostWallet('testuser', 'password123')
    const w2 = mostWallet('testuser', 'password123')
    assert.strictEqual(w1.address, w2.address)
    assert.strictEqual(w1.danger, w2.danger)
  })

  it('derives different addresses for different passwords', () => {
    const w1 = mostWallet('testuser', 'password1')
    const w2 = mostWallet('testuser', 'password2')
    assert.notStrictEqual(w1.address, w2.address)
  })

  it('derives different addresses for different usernames', () => {
    const w1 = mostWallet('user1', 'password')
    const w2 = mostWallet('user2', 'password')
    assert.notStrictEqual(w1.address, w2.address)
  })

  it('returns valid ethereum address format', () => {
    const w = mostWallet('test', 'pass')
    assert.match(w.address, /^0x[a-fA-F0-9]{40}$/)
  })
})

describe('mostMnemonic', () => {
  it('converts danger seed to mnemonic phrase', () => {
    const w = mostWallet('test', 'pass')
    const mnemonic = mostMnemonic(w.danger)
    assert.strictEqual(typeof mnemonic, 'string')
    assert.ok(mnemonic.split(' ').length >= 12)
  })

  it('produces consistent mnemonic from same seed', () => {
    const w = mostWallet('test', 'pass')
    const m1 = mostMnemonic(w.danger)
    const m2 = mostMnemonic(w.danger)
    assert.strictEqual(m1, m2)
  })
})

describe('most25519', () => {
  it('derives x25519 and ed25519 key pairs', () => {
    const w = mostWallet('test', 'pass')
    const keys = most25519(w.danger)
    assert.ok(keys.public_key)
    assert.ok(keys.private_key)
    assert.ok(keys.ed_public_key)
  })

  it('produces consistent keys from same seed', () => {
    const w = mostWallet('test', 'pass')
    const k1 = most25519(w.danger)
    const k2 = most25519(w.danger)
    assert.deepStrictEqual(k1, k2)
  })
})

describe('mostSignMessage', () => {
  it('signs messages with the derived ethereum wallet', async () => {
    const w = mostWallet('test', 'pass')
    const message = '1234567890:GET:/auth/backup'
    const signed = await mostSignMessage(w.danger, message)
    const recovered = verifyMessage(message, signed.signature)

    assert.strictEqual(signed.address, w.address)
    assert.strictEqual(recovered, w.address)
    assert.match(signed.signature, /^0x[a-fA-F0-9]+$/)
  })
})

describe('mostEncode / mostDecode', () => {
  it('round-trips private note content', () => {
    const w = mostWallet('test', 'pass')
    const encrypted = mostEncode('hello note', w.danger)

    assert.ok(encrypted.startsWith('mp://1.'))
    assert.strictEqual(mostDecode(encrypted, w.danger), 'hello note')
  })

  it('returns an empty string with the wrong key', () => {
    const encrypted = mostEncode('secret', mostWallet('a', 'b').danger)

    assert.strictEqual(mostDecode(encrypted, mostWallet('a', 'c').danger), '')
  })
})

describe('mostBoxEncrypt / mostBoxDecrypt', () => {
  function boxKeys() {
    return {
      alice: most25519(mostWallet('alice', 'secret-a').danger),
      bob: most25519(mostWallet('bob', 'secret-b').danger),
    }
  }

  it('decrypts content with sender public key and recipient private key', () => {
    const { alice, bob } = boxKeys()
    const encrypted = mostBoxEncrypt('hello bob', {
      senderPrivateKey: alice.private_key,
      recipientPublicKey: bob.public_key,
    })

    assert.doesNotMatch(encrypted, /[+.=/]/)
    assert.ok(!encrypted.includes('://'))
    const info = parseMostBoxToken(encrypted)
    assert.strictEqual(info.version, 1)
    assert.ok(Number.isSafeInteger(info.timestampMs))
    assert.ok(info.timestampMs <= Date.now())
    assert.doesNotMatch(info.nonce, /[+.=/]/)
    assert.strictEqual(
      mostBoxDecrypt(encrypted, {
        senderPublicKey: alice.public_key,
        recipientPrivateKey: bob.private_key,
      }),
      'hello bob'
    )
  })

  it('decrypts content in the opposite direction', () => {
    const { alice, bob } = boxKeys()
    const encrypted = mostBoxEncrypt('hello alice', {
      senderPrivateKey: bob.private_key,
      recipientPublicKey: alice.public_key,
    })

    assert.doesNotMatch(encrypted, /[+.=/]/)
    assert.strictEqual(
      mostBoxDecrypt(encrypted, {
        senderPublicKey: bob.public_key,
        recipientPrivateKey: alice.private_key,
      }),
      'hello alice'
    )
  })

  it('does not decrypt when sender and recipient roles are reversed', () => {
    const { alice, bob } = boxKeys()
    const encrypted = mostBoxEncrypt('hello bob', {
      senderPrivateKey: alice.private_key,
      recipientPublicKey: bob.public_key,
    })

    assert.strictEqual(
      mostBoxDecrypt(encrypted, {
        senderPublicKey: bob.public_key,
        recipientPrivateKey: alice.private_key,
      }),
      ''
    )
  })

  it('rejects invalid box tokens', () => {
    const { alice, bob } = boxKeys()
    const encrypted = mostBoxEncrypt('hello bob', {
      senderPrivateKey: alice.private_key,
      recipientPublicKey: bob.public_key,
    })
    const payload = Buffer.from(encrypted, 'base64url')
    payload[0] = 2
    const wrongVersion = payload.toString('base64url')
    const tooShort = Buffer.from([1, 0, 0]).toString('base64url')
    const decrypt = token =>
      mostBoxDecrypt(token, {
        senderPublicKey: alice.public_key,
        recipientPrivateKey: bob.private_key,
      })

    assert.strictEqual(decrypt(''), '')
    assert.strictEqual(decrypt('not.valid'), '')
    assert.strictEqual(decrypt(wrongVersion), '')
    assert.strictEqual(decrypt(tooShort), '')
    assert.strictEqual(parseMostBoxToken(''), null)
    assert.strictEqual(parseMostBoxToken('not.valid'), null)
    assert.strictEqual(parseMostBoxToken(wrongVersion), null)
    assert.strictEqual(parseMostBoxToken(tooShort), null)
  })
})
