import { describe, it } from 'node:test'
import assert from 'node:assert'
import { verifyMessage } from 'ethers'
import {
  ACCOUNT_BACKUP_API_URL,
  buildAccountBackupUpload,
  decryptAccountBackup,
  encryptAccountBackup,
  getAccountBackupAuthHeaders,
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
    trashFiles: [],
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

  it('rejects old note-only backup payloads', () => {
    const wallet = mostWallet('alice', 'secret')
    const encrypted = mostEncode(JSON.stringify({ notes: [] }), wallet.danger)

    assert.throws(
      () => decryptAccountBackup(encrypted, wallet.danger),
      /无效的账号备份格式/
    )
  })

  it('builds authenticated upload payloads', async () => {
    const wallet = mostWallet('alice', 'secret')
    const upload = await buildAccountBackupUpload(
      wallet,
      createPayload(wallet.address)
    )

    assert.ok(upload.cid)
    assert.ok(upload.body.startsWith('mp://1.'))
    assert.strictEqual(upload.headers['Content-Type'], 'text/plain')
    assert.strictEqual(upload.headers['x-backup-cid'], upload.cid)
    assert.match(upload.headers.Authorization, /^[^,]+,\d+,0x[a-fA-F0-9]+$/)
  })

  it('uses the ethereum wallet address in auth headers', async () => {
    const wallet = mostWallet('alice', 'secret')
    const headers = await getAccountBackupAuthHeaders(
      wallet,
      'GET',
      ACCOUNT_BACKUP_API_URL
    )
    const [address, timestamp, signature] = headers.Authorization.split(',')

    assert.match(headers.Authorization, /^[^,]+,\d+,0x[a-fA-F0-9]+$/)
    assert.strictEqual(address, wallet.address)
    assert.ok(timestamp)
    assert.ok(signature)
    assert.strictEqual(
      verifyMessage(`${timestamp}:GET:/auth/backup`, signature),
      wallet.address
    )
  })
})
