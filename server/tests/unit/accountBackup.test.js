import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  decryptAccountBackup,
  encryptAccountBackup,
} from '../../src/utils/accountBackup.js'
import { mostEncode, mostWallet } from '../../src/utils/mostWallet.js'

function createPayload(ownerAddress, legacy = false) {
  return {
    type: 'mostbox.account-backup',
    schemaVersion: 1,
    ownerAddress,
    exportedAt: new Date(0).toISOString(),
    ...(legacy
      ? {
          notes: [{ name: 'n', content: 'hello', type: 'file' }],
          noteVault: { files: [] },
        }
      : {}),
    profile: {
      displayName: 'Alice',
      avatar: '',
      updatedAt: 1000,
    },
    files: [],
    channels: [],
  }
}

describe('accountBackup', () => {
  it('encrypts and decrypts account backup payloads without knowledge fields', () => {
    const wallet = mostWallet('alice', 'secret')
    const payload = createPayload(wallet.address)
    const encrypted = encryptAccountBackup(payload, wallet.danger)
    const decrypted = decryptAccountBackup(encrypted, wallet.danger)

    assert.deepStrictEqual(decrypted, payload)
  })

  it('drops legacy notes and note vault fields during import', () => {
    const wallet = mostWallet('alice', 'secret')
    const payload = createPayload(wallet.address, true)
    const encrypted = mostEncode(JSON.stringify(payload), wallet.danger)
    const decrypted = decryptAccountBackup(encrypted, wallet.danger)

    assert.equal('notes' in decrypted, false)
    assert.equal('noteVault' in decrypted, false)
    assert.equal(decrypted.profile.displayName, 'Alice')
  })

  it('rejects old note-only backup payloads', () => {
    const wallet = mostWallet('alice', 'secret')
    const encrypted = mostEncode(
      JSON.stringify({
        type: 'mostbox.account-backup',
        schemaVersion: 1,
        notes: [],
      }),
      wallet.danger
    )

    assert.throws(
      () => decryptAccountBackup(encrypted, wallet.danger),
      /账号备份缺少 ownerAddress/
    )
  })
})
