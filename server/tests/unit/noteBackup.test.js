import { describe, it } from 'node:test'
import assert from 'node:assert'
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

  it('uses the backup API path in auth messages', () => {
    const wallet = mostWallet('alice', 'secret')
    const headers = getBackupAuthHeaders(wallet, 'GET', NOTE_BACKUP_API_URL)

    assert.match(headers.Authorization, /^[^,]+,\d+,0x[a-fA-F0-9]+$/)
  })
})
