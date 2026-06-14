import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

export function normalizeNotePath(input = '') {
  return String(input)
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(part => part && part !== '.')
    .filter(part => part !== '..')
    .join('/')
}

export function getNoteFullPath(note) {
  const path = normalizeNotePath(note?.path || '')
  const name = String(note?.name || '').trim()
  return path ? `${path}/${name}` : name
}

export const NOTE_NAME_ERROR_CODES = {
  EMPTY: 'empty',
  SLASH: 'slash',
  BACKSLASH: 'backslash',
}

export function validateNoteName(name) {
  const value = String(name || '').trim()
  if (!value) {
    return {
      valid: false,
      errorCode: NOTE_NAME_ERROR_CODES.EMPTY,
      error: 'Name is required',
    }
  }
  if (value.includes('/')) {
    return {
      valid: false,
      errorCode: NOTE_NAME_ERROR_CODES.SLASH,
      error: 'Name cannot contain /',
    }
  }
  if (value.includes('\\')) {
    return {
      valid: false,
      errorCode: NOTE_NAME_ERROR_CODES.BACKSLASH,
      error: 'Name cannot contain \\',
    }
  }
  return { valid: true, name: value }
}

export async function calculateNoteCid(content = '') {
  const bytes = new TextEncoder().encode(String(content))
  const hash = await sha256.digest(bytes)
  return CID.create(1, raw.code, hash).toString()
}

export function filterNotesByPath(notes, currentPath = '', query = '') {
  const normalizedCurrentPath = normalizeNotePath(currentPath)
  const normalizedQuery = query.trim().toLowerCase()
  const files = Array.isArray(notes) ? notes : []

  if (normalizedQuery) {
    return files
      .filter(note =>
        String(note.name || '')
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .sort(sortNotesForExplorer)
  }

  const directItems = []
  const inferredDirs = new Map()

  for (const note of files) {
    const notePath = normalizeNotePath(note.path || '')

    if (notePath === normalizedCurrentPath) {
      directItems.push(note)
      continue
    }

    if (
      normalizedCurrentPath === '' ||
      notePath.startsWith(`${normalizedCurrentPath}/`)
    ) {
      const relativePath =
        normalizedCurrentPath === ''
          ? notePath
          : notePath.slice(normalizedCurrentPath.length + 1)
      const firstSegment = relativePath.split('/').filter(Boolean)[0]

      if (firstSegment && !inferredDirs.has(firstSegment)) {
        inferredDirs.set(firstSegment, {
          name: firstSegment,
          type: 'directory',
          path: normalizedCurrentPath,
          size: 0,
          cid: `__dir__${normalizedCurrentPath}/${firstSegment}`,
          created_at: note.created_at || Date.now(),
          updated_at: note.updated_at || note.created_at || Date.now(),
        })
      }
    }
  }

  return [...inferredDirs.values(), ...directItems].sort(sortNotesForExplorer)
}

export function renameNotesByPath(notes, oldFullPath, targetPath, targetName) {
  const oldPath = normalizeNotePath(oldFullPath)
  const newPath = normalizeNotePath(targetPath)
  const cleanName = String(targetName || '').trim()
  const targetFullPath = normalizeNotePath(
    newPath ? `${newPath}/${cleanName}` : cleanName
  )
  const now = Date.now()

  return notes.map(note => {
    const fullPath = getNoteFullPath(note)

    if (fullPath === oldPath) {
      return { ...note, path: newPath, name: cleanName, updated_at: now }
    }

    if (fullPath.startsWith(`${oldPath}/`)) {
      const relativePath = fullPath.slice(oldPath.length + 1)
      const nextFullPath = normalizeNotePath(
        `${targetFullPath}/${relativePath}`
      )
      const lastSlash = nextFullPath.lastIndexOf('/')
      return {
        ...note,
        path: lastSlash === -1 ? '' : nextFullPath.slice(0, lastSlash),
        name: nextFullPath.slice(lastSlash + 1),
        updated_at: now,
      }
    }

    return note
  })
}

function sortNotesForExplorer(a, b) {
  if (a.type === 'directory' && b.type !== 'directory') return -1
  if (a.type !== 'directory' && b.type === 'directory') return 1
  return (
    (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0)
  )
}
