import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  createGuestIdentity,
  createLoginIdentity,
  generateGuestPassword,
  getDisplayName,
} from '../../src/utils/userIdentity.js'

describe('userIdentity', () => {
  describe('createGuestIdentity', () => {
    it('creates a guest identity with a password', () => {
      const identity = createGuestIdentity('test-password-123')
      assert.strictEqual(identity.username, '匿名')
      assert.strictEqual(identity.password, 'test-password-123')
      assert.ok(identity.address)
      assert.ok(identity.address.startsWith('0x'))
      assert.ok(identity.displayName.startsWith('匿名#'))
    })

    it('produces consistent identity for same password', () => {
      const id1 = createGuestIdentity('same-password')
      const id2 = createGuestIdentity('same-password')
      assert.strictEqual(id1.address, id2.address)
      assert.strictEqual(id1.displayName, id2.displayName)
    })

    it('produces different identities for different passwords', () => {
      const id1 = createGuestIdentity('password-a')
      const id2 = createGuestIdentity('password-b')
      assert.notStrictEqual(id1.address, id2.address)
    })
  })

  describe('createLoginIdentity', () => {
    it('creates a login identity with username and password', () => {
      const identity = createLoginIdentity('alice', 'secret')
      assert.strictEqual(identity.username, 'alice')
      assert.strictEqual(identity.password, 'secret')
      assert.ok(identity.address)
      assert.ok(identity.address.startsWith('0x'))
      assert.ok(identity.displayName.includes('alice'))
    })

    it('produces consistent identity for same credentials', () => {
      const id1 = createLoginIdentity('bob', 'pass123')
      const id2 = createLoginIdentity('bob', 'pass123')
      assert.strictEqual(id1.address, id2.address)
      assert.strictEqual(id1.displayName, id2.displayName)
    })

    it('produces different identities for different usernames', () => {
      const id1 = createLoginIdentity('alice', 'same-pass')
      const id2 = createLoginIdentity('bob', 'same-pass')
      assert.notStrictEqual(id1.address, id2.address)
    })
  })

  describe('generateGuestPassword', () => {
    it('generates a 64-character hex string', () => {
      const pwd = generateGuestPassword()
      assert.strictEqual(pwd.length, 64)
      assert.ok(/^[0-9a-f]+$/.test(pwd))
    })

    it('generates different passwords each time', () => {
      const pwd1 = generateGuestPassword()
      const pwd2 = generateGuestPassword()
      assert.notStrictEqual(pwd1, pwd2)
    })
  })

  describe('getDisplayName', () => {
    it('returns anonymous format for 匿名 user', () => {
      const name = getDisplayName('0xabcdef1234567890', '匿名')
      assert.ok(name.startsWith('匿名#'))
    })

    it('returns username with suffix for named user', () => {
      const name = getDisplayName('0xabcdef1234567890', 'alice')
      assert.ok(name.startsWith('alice#'))
    })

    it('uses uppercase last 4 chars for named user', () => {
      const name = getDisplayName('0xabcdef1234567890', 'alice')
      assert.ok(/[A-F0-9]{4}$/.test(name))
    })
  })
})
