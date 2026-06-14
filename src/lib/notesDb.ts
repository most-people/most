import type { NoteItem } from '~/stores/useAppStore'

const DB_NAME = 'mostbox'
const DB_VERSION = 1
const STORE_NAME = 'notes'

interface NotesRecord {
  address: string
  notes: NoteItem[]
  notesPath: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'address' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getNotes(
  address: string
): Promise<{ notes: NoteItem[]; notesPath: string } | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(address)
    req.onsuccess = () => {
      const record = req.result as NotesRecord | undefined
      resolve(
        record ? { notes: record.notes, notesPath: record.notesPath } : null
      )
    }
    req.onerror = () => reject(req.error)
  })
}

export async function putNotes(
  address: string,
  notes: NoteItem[],
  notesPath: string
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put({ address, notes, notesPath } satisfies NotesRecord)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
