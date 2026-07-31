import { calculateNoteCid, getNoteFullPath } from './noteUtils.js'
import { tryMostDecode } from './mostWallet.js'

const LEGACY_ENCRYPTED_NOTE_PREFIX = 'mp://1.'

export function isLegacyEncryptedNoteContent(content) {
  return String(content || '').startsWith(LEGACY_ENCRYPTED_NOTE_PREFIX)
}

export function inspectLegacyEncryptedNote(content, danger) {
  const value = String(content || '')
  if (!isLegacyEncryptedNoteContent(value)) {
    return { encrypted: false, decryptable: false, content: '' }
  }

  const decoded = tryMostDecode(value, danger)
  return {
    encrypted: true,
    decryptable: decoded.ok,
    content: decoded.ok ? decoded.content : '',
  }
}

export async function decryptLegacyBrowserNotes(
  notes,
  danger,
  updatedAt = Date.now()
) {
  const decryptedPaths = []
  const failedPaths = []

  const nextNotes = await Promise.all(
    notes.map(async note => {
      const path = getNoteFullPath(note)
      const inspection = inspectLegacyEncryptedNote(note.content, danger)
      if (!inspection.encrypted) return note
      if (!inspection.decryptable) {
        failedPaths.push(path)
        return note
      }

      decryptedPaths.push(path)
      const content = inspection.content
      return {
        name: note.name,
        cid: await calculateNoteCid(content),
        path: note.path,
        content,
        size: new TextEncoder().encode(content).length,
        type: 'file',
        created_at: note.created_at,
        updated_at: updatedAt,
      }
    })
  )

  return { notes: nextNotes, decryptedPaths, failedPaths }
}
