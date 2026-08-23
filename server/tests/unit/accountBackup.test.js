import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  decryptAccountBackup,
  encryptAccountBackup,
} from '../../src/utils/accountBackup.js'
import { mostEncode, mostWallet } from '../../src/utils/mostWallet.js'

function createPayload(ownerAddress) {
  return {
    type: 'mostbox.account-backup',
    schemaVersion: 1,
    ownerAddress,
    exportedAt: new Date(0).toISOString(),
    notes: [{ name: 'n', content: 'hello', type: 'file' }],
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
  it('encrypts and decrypts account backup payloads', () => {
    const wallet = mostWallet('alice', 'secret')
    const payload = createPayload(wallet.address)
    const encrypted = encryptAccountBackup(payload, wallet.danger)
    const decrypted = decryptAccountBackup(encrypted, wallet.danger)

    assert.deepStrictEqual(decrypted, payload)
  })

  it('preserves opaque legacy article content inside the encrypted backup', () => {
    const wallet = mostWallet('alice', 'secret')
    const payload = createPayload(wallet.address)
    payload.notes[0].content = 'mp://1.legacy-article-ciphertext'

    const encrypted = encryptAccountBackup(payload, wallet.danger)
    const decrypted = decryptAccountBackup(encrypted, wallet.danger)

    assert.deepStrictEqual(decrypted.notes, payload.notes)
  })

  it('encrypts and decrypts account backups with note vault snapshots', () => {
    const wallet = mostWallet('alice', 'secret')
    const payload = {
      ...createPayload(wallet.address),
      noteVault: {
        files: [
          {
            path: 'docs/hello.md',
            content: '# Hello',
            size: 7,
            mtimeMs: 1000,
          },
        ],
      },
    }
    const encrypted = encryptAccountBackup(payload, wallet.danger)
    const decrypted = decryptAccountBackup(encrypted, wallet.danger)

    assert.deepStrictEqual(decrypted, payload)
  })

  it('rejects malformed note vault backup payloads', () => {
    const wallet = mostWallet('alice', 'secret')
    const payload = {
      ...createPayload(wallet.address),
      noteVault: { files: {} },
    }

    assert.throws(
      () => encryptAccountBackup(payload, wallet.danger),
      /noteVault/
    )
  })

  it('rejects old note-only backup payloads', () => {
    const wallet = mostWallet('alice', 'secret')
    const encrypted = mostEncode(JSON.stringify({ notes: [] }), wallet.danger)

    assert.throws(
      () => decryptAccountBackup(encrypted, wallet.danger),
      /无效的账号备份格式/
    )
  })
})
