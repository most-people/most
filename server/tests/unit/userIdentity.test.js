import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  createLoginIdentity,
  getDisplayName,
} from '../../src/utils/userIdentity.js'

describe('userIdentity', () => {
  describe('createLoginIdentity', () => {
    it('creates a login identity with username and password', () => {
      const identity = createLoginIdentity('alice', 'secret')
      assert.strictEqual(identity.username, 'alice')
      assert.strictEqual(identity.password, undefined)
      assert.ok(identity.address)
      assert.ok(identity.address.startsWith('0x'))
      assert.ok(identity.displayName.includes('alice'))
      assert.ok(identity.danger)
      assert.ok(identity.danger.startsWith('0x'))
    })

    it('produces consistent identity for same credentials', () => {
      const id1 = createLoginIdentity('bob', 'pass123')
      const id2 = createLoginIdentity('bob', 'pass123')
      assert.strictEqual(id1.address, id2.address)
      assert.strictEqual(id1.displayName, id2.displayName)
      assert.strictEqual(id1.danger, id2.danger)
    })

    it('produces different identities for different usernames', () => {
      const id1 = createLoginIdentity('alice', 'same-pass')
      const id2 = createLoginIdentity('bob', 'same-pass')
      assert.notStrictEqual(id1.address, id2.address)
    })
  })

  describe('getDisplayName', () => {
    it('returns short address when username is missing', () => {
      const name = getDisplayName('0xabcdef1234567890')
      assert.strictEqual(name, '0xabcd...7890')
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
