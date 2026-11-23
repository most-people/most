import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IDENTITY_VERSION,
  createLoginIdentity,
  createLoginSession,
  getDisplayName,
} from '../../src/utils/userIdentity.js'
import { mostWallet } from '../../src/utils/mostWallet.js'
import { verifyDeviceCert } from '../../src/utils/auth.js'

describe('userIdentity', () => {
  describe('createLoginIdentity', () => {
    it('previews the v2 chat address without exposing any seed', async () => {
      const identity = await createLoginIdentity('alice', 'secret')
      assert.strictEqual(identity.username, 'alice')
      assert.strictEqual(identity.password, undefined)
      assert.strictEqual(identity.danger, undefined)
      assert.ok(/^0x[0-9a-fA-F]{40}$/.test(identity.address))
      assert.ok(identity.displayName.includes('alice'))
      // The chat identity is separate from the v1 wallet (decision D3).
      assert.notStrictEqual(
        identity.address,
        mostWallet('alice', 'secret').address
      )
    })

    it('produces consistent identity for same credentials', async () => {
      const id1 = await createLoginIdentity('bob', 'pass123')
      const id2 = await createLoginIdentity('bob', 'pass123')
      assert.strictEqual(id1.address, id2.address)
      assert.strictEqual(id1.displayName, id2.displayName)
    })

    it('produces different identities for different usernames', async () => {
      const id1 = await createLoginIdentity('alice', 'same-pass')
      const id2 = await createLoginIdentity('bob', 'same-pass')
      assert.notStrictEqual(id1.address, id2.address)
    })
  })

  describe('createLoginSession', () => {
    it('signs in as the current identity and issues a device certificate', async () => {
      const session = await createLoginSession('carol', 'secret')
      assert.strictEqual(session.identity.version, IDENTITY_VERSION)
      assert.strictEqual(
        session.identity.address,
        (await createLoginIdentity('carol', 'secret')).address
      )
      assert.strictEqual(
        verifyDeviceCert(session.identity.device.cert).address,
        session.identity.address.toLowerCase()
      )
    })
  })

  describe('getDisplayName', () => {
    it('returns short address when username is missing', () => {
      const name = getDisplayName('0xabcdef1234567890')
      assert.strictEqual(name, '0xabcd...7890')
    })

    it('keeps an already short address unchanged', () => {
      assert.strictEqual(getDisplayName('0x1234'), '0x1234')
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
