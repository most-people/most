import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  mostCrust,
  mostDecode,
  mostEncode,
  mostWallet,
  mostMnemonic,
  most25519,
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

describe('mostCrust', () => {
  it('derives a deterministic Crust address and signer', () => {
    const w = mostWallet('test', 'pass')
    const c1 = mostCrust(w.danger)
    const c2 = mostCrust(w.danger)

    assert.strictEqual(c1.crust_address, c2.crust_address)
    assert.match(c1.sign('hello'), /^0x[a-fA-F0-9]+$/)
    assert.match(c2.sign('hello'), /^0x[a-fA-F0-9]+$/)
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
