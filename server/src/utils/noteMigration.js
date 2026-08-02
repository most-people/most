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

export async function decryptLegacyBrowserNotes(notes, danger) {
  const decryptedPaths = []
  const failedPaths = []

  const nextNotes = await Promise.all(
    (Array.isArray(notes) ? notes : []).map(async note => {
      const path = getNoteFullPath(note)
      const inspection = inspectLegacyEncryptedNote(note?.content, danger)
      if (!inspection.encrypted) return note
      if (!inspection.decryptable) {
        failedPaths.push(path)
        return note
      }

      decryptedPaths.push(path)
      const content = inspection.content
      return {
        ...note,
        cid: await calculateNoteCid(content),
        content,
        size: new TextEncoder().encode(content).length,
      }
    })
  )

  return { notes: nextNotes, decryptedPaths, failedPaths }
}

export function decryptLegacyNoteVaultSnapshot(snapshot, danger) {
  const decryptedPaths = []
  const failedPaths = []
  const files = Array.isArray(snapshot?.files) ? snapshot.files : []

  const nextFiles = files.map(file => {
    const inspection = inspectLegacyEncryptedNote(file?.content, danger)
    if (!inspection.encrypted) return file
    if (!inspection.decryptable) {
      failedPaths.push(String(file?.path || ''))
      return file
    }

    decryptedPaths.push(String(file?.path || ''))
    const content = inspection.content
    return {
      ...file,
      content,
      size: new TextEncoder().encode(content).length,
    }
  })

  return {
    snapshot: { ...snapshot, files: nextFiles },
    decryptedPaths,
    failedPaths,
  }
}

export async function decryptLegacyAccountBackupNotes(payload, danger) {
  const browser = await decryptLegacyBrowserNotes(payload?.notes, danger)
  const vault = payload?.noteVault
    ? decryptLegacyNoteVaultSnapshot(payload.noteVault, danger)
    : null

  return {
    payload: {
      ...payload,
      notes: browser.notes,
      ...(vault ? { noteVault: vault.snapshot } : {}),
    },
    decryptedPaths: [
      ...browser.decryptedPaths,
      ...(vault?.decryptedPaths || []),
    ],
    failedPaths: [...browser.failedPaths, ...(vault?.failedPaths || [])],
  }
}
