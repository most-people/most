import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptLegacyBrowserNotes,
  inspectLegacyEncryptedNote,
  isLegacyEncryptedNoteContent,
} from '../../src/utils/noteMigration.js'
import { mostEncode, mostWallet } from '../../src/utils/mostWallet.js'

function createNote(name, content, overrides = {}) {
  return {
    name,
    cid: `${name}-cid`,
    path: '',
    content,
    size: new TextEncoder().encode(content).length,
    type: 'file',
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('legacy note migration', () => {
  it('recognizes only legacy article ciphertext', () => {
    assert.equal(isLegacyEncryptedNoteContent('mp://1.nonce.payload'), true)
    assert.equal(isLegacyEncryptedNoteContent('# Markdown'), false)
    assert.equal(isLegacyEncryptedNoteContent('mp://2.nonce.payload'), false)
  })

  it('distinguishes decryptable empty content from invalid ciphertext', () => {
    const wallet = mostWallet('legacy-empty', 'pass')
    const encryptedEmpty = mostEncode('', wallet.danger)

    assert.deepEqual(
      inspectLegacyEncryptedNote(encryptedEmpty, wallet.danger),
      {
        encrypted: true,
        decryptable: true,
        content: '',
      }
    )
    assert.deepEqual(
      inspectLegacyEncryptedNote(encryptedEmpty, mostWallet('x', 'y').danger),
      { encrypted: true, decryptable: false, content: '' }
    )
  })

  it('replaces decryptable notes and preserves failed or plain notes', async () => {
    const wallet = mostWallet('legacy-user', 'pass')
    const encrypted = mostEncode('# recovered', wallet.danger)
    const encryptedEmpty = mostEncode('', wallet.danger)
    const broken = createNote('broken.md', 'mp://1.invalid.payload')
    const plain = createNote('plain.md', '# plain')
    const notes = [
      createNote('secret.md', encrypted, { path: 'archive' }),
      createNote('empty.md', encryptedEmpty),
      broken,
      plain,
    ]

    const result = await decryptLegacyBrowserNotes(
      notes,
      wallet.danger,
      1_800_000_000_000
    )

    assert.deepEqual(result.decryptedPaths, ['archive/secret.md', 'empty.md'])
    assert.deepEqual(result.failedPaths, ['broken.md'])
    assert.equal(result.notes[0].content, '# recovered')
    assert.notEqual(result.notes[0].cid, notes[0].cid)
    assert.equal(result.notes[0].updated_at, 1_800_000_000_000)
    assert.equal(result.notes[1].content, '')
    assert.equal(result.notes[1].size, 0)
    assert.equal(result.notes[2], broken)
    assert.equal(result.notes[3], plain)
  })
})
