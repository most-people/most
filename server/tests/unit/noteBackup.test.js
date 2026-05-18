import { describe, it } from 'node:test'
import assert from 'node:assert'
import { verifyMessage } from 'ethers'
import {
  buildNotesBackupUpload,
  decryptNotesBackup,
  encryptNotesBackup,
  getBackupAuthHeaders,
  NOTE_BACKUP_API_URL,
} from '../../src/utils/noteBackup.js'
import { mostWallet } from '../../src/utils/mostWallet.js'

describe('noteBackup', () => {
  it('encrypts and decrypts note backup payloads', () => {
    const wallet = mostWallet('alice', 'secret')
    const notes = [{ name: 'n', content: 'hello', type: 'file' }]
    const encrypted = encryptNotesBackup(notes, wallet.danger)
    const decrypted = decryptNotesBackup(encrypted, wallet.danger)

    assert.deepStrictEqual(decrypted.notes, notes)
  })

  it('builds authenticated upload payloads', async () => {
    const wallet = mostWallet('alice', 'secret')
    const upload = await buildNotesBackupUpload(wallet, [])

    assert.ok(upload.cid)
    assert.ok(upload.body.startsWith('mp://1.'))
    assert.strictEqual(upload.headers['Content-Type'], 'text/plain')
    assert.strictEqual(upload.headers['x-backup-cid'], upload.cid)
    assert.match(upload.headers.Authorization, /^[^,]+,\d+,0x[a-fA-F0-9]+$/)
  })

  it('uses the ethereum wallet address in auth headers', async () => {
    const wallet = mostWallet('alice', 'secret')
    const headers = await getBackupAuthHeaders(wallet, 'GET', NOTE_BACKUP_API_URL)
    const [address, timestamp, signature] = headers.Authorization.split(',')

    assert.match(headers.Authorization, /^[^,]+,\d+,0x[a-fA-F0-9]+$/)
    assert.strictEqual(address, wallet.address)
    assert.ok(timestamp)
    assert.ok(signature)
    assert.strictEqual(
      verifyMessage(`${timestamp}:GET:/api/backup`, signature),
      wallet.address
    )
  })
})
