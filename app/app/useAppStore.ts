import {
  calculateNoteCid,
  getNoteFullPath,
  normalizeNotePath,
  renameNotesByPath,
  validateNoteName,
} from '~/server/src/utils/noteUtils.js'
import { create } from 'zustand'
import {
  checkBackendConnection,
  detectSameOriginBackend,
  detectLocalhostBackend,
  setBackendUrl,
  getBackendUrlExport,
} from '~/server/src/utils/api'

const NOTES_STORAGE_KEY = 'mostbox_notes'

interface ToastItem {
  id: number
  message: string
  type: string
}

export interface NoteItem {
  name: string
  cid: string
  path: string
  content: string
  size: number
  type: 'file'
  created_at: number
  updated_at: number
  isSecret?: boolean
}

interface AppState {
  // Backend
  hasBackend: boolean | null
  checkBackend: () => Promise<void>

  // Theme
  isDarkMode: boolean
  setIsDarkMode: (v: boolean) => void

  // Toast
  toasts: ToastItem[]
  addToast: (message: string, type?: string) => void
  removeToast: (id: number) => void

  // Settings
  showSettings: boolean
  openSettings: () => void
  closeSettings: () => void

  initializeLocalData: () => void

  // Notes
  notes: NoteItem[]
  notesPath: string
  setNotesPath: (path: string) => void
  saveNote: (input: {
    cid?: string
    name: string
    path?: string
    content?: string
    isSecret?: boolean
  }) => Promise<string>
  deleteNote: (cid?: string, path?: string, name?: string) => void
  renameNote: (oldFullPath: string, newPath: string, newName: string) => void
  importNotes: (notes: NoteItem[]) => void
}

function readJson(key: string) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizeNotes(input: unknown): NoteItem[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(note => {
      if (!note || typeof note !== 'object') return false
      const value = note as Partial<NoteItem>
      return value.type === 'file' || value.content !== undefined
    })
    .map(note => ({
      name: String((note as Partial<NoteItem>).name || '未命名'),
      cid: String((note as Partial<NoteItem>).cid || ''),
      path: normalizeNotePath((note as Partial<NoteItem>).path || ''),
      content: String((note as Partial<NoteItem>).content || ''),
      size: Number((note as Partial<NoteItem>).size || 0),
      type: 'file' as const,
      created_at: Number(
        (note as Partial<NoteItem>).created_at ||
          (note as Partial<NoteItem>).updated_at ||
          Date.now()
      ),
      updated_at: Number(
        (note as Partial<NoteItem>).updated_at ||
          (note as Partial<NoteItem>).created_at ||
          Date.now()
      ),
      isSecret:
        (note as Partial<NoteItem>).isSecret === true ||
        String((note as Partial<NoteItem>).content || '').startsWith('mp://1'),
    }))
}

function persistNotes(notes: NoteItem[], notesPath: string) {
  writeJson(NOTES_STORAGE_KEY, {
    notes,
    notesPath: normalizeNotePath(notesPath),
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  // Backend
  hasBackend: null,
  checkBackend: async () => {
    const existing = getBackendUrlExport()
    if (existing) {
      const connected = await checkBackendConnection()
      if (connected) {
        setBackendUrl(existing)
        set({ hasBackend: true })
        return
      }
    }
    const sameOrigin = await detectSameOriginBackend()
    if (sameOrigin) {
      setBackendUrl('')
      set({ hasBackend: true })
      return
    }
    const localhost = await detectLocalhostBackend()
    if (localhost) {
      setBackendUrl('http://localhost:1976')
      set({ hasBackend: true })
    } else {
      set({ hasBackend: false })
    }
  },

  // Theme
  isDarkMode: false,
  setIsDarkMode: v => {
    set({ isDarkMode: v })
    document.documentElement.setAttribute('data-theme', v ? 'dark' : 'light')
    localStorage.setItem('theme', v ? 'dark' : 'light')
  },

  // Toast
  toasts: [],
  addToast: (message, type = 'info') => {
    set(state => ({
      toasts: [...state.toasts, { id: Date.now(), message, type }],
    }))
  },
  removeToast: id => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }))
  },

  // Settings
  showSettings: false,
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),

  initializeLocalData: () => {
    const noteState = readJson(NOTES_STORAGE_KEY)
    set({
      notes: normalizeNotes(noteState?.notes),
      notesPath: normalizeNotePath(noteState?.notesPath || ''),
    })
  },

  // Notes
  notes: [],
  notesPath: '',
  setNotesPath: path => {
    const notesPath = normalizeNotePath(path)
    set({ notesPath })
    persistNotes(get().notes, notesPath)
  },
  saveNote: async input => {
    const nameValidation = validateNoteName(input.name)
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error)
    }

    const path = normalizeNotePath(input.path || '')
    const content = String(input.content || '')
    const cid = await calculateNoteCid(content)
    const size = new TextEncoder().encode(content).length
    const now = Date.now()

    const notes = get().notes
    const existingIndex = input.cid
      ? notes.findIndex(note => note.cid === input.cid)
      : notes.findIndex(
          note => normalizeNotePath(note.path) === path && note.name === nameValidation.name
        )
    const targetFullPath = normalizeNotePath(
      path ? `${path}/${nameValidation.name}` : nameValidation.name
    )
    const hasNameConflict = notes.some((note, index) => {
      return index !== existingIndex && getNoteFullPath(note) === targetFullPath
    })
    if (hasNameConflict) {
      throw new Error('目标位置已存在同名笔记')
    }

    const existing = existingIndex >= 0 ? notes[existingIndex] : null
    const nextNote: NoteItem = {
      name: nameValidation.name,
      cid,
      path,
      content,
      size,
      type: 'file',
      created_at: existing?.created_at || now,
      updated_at: now,
      isSecret: input.isSecret === true || content.startsWith('mp://1'),
    }
    const nextNotes =
      existingIndex >= 0
        ? notes.map((note, index) => (index === existingIndex ? nextNote : note))
        : [...notes, nextNote]

    set({ notes: nextNotes })
    persistNotes(nextNotes, get().notesPath)
    return cid
  },
  deleteNote: (cid, path, name) => {
    const targetPath =
      path !== undefined && name !== undefined
        ? normalizeNotePath(`${path}/${name}`)
        : ''
    const nextNotes = get().notes.filter(note => {
      if (cid && note.cid === cid) return false
      if (targetPath) {
        const fullPath = getNoteFullPath(note)
        return fullPath !== targetPath && !fullPath.startsWith(`${targetPath}/`)
      }
      return true
    })
    set({ notes: nextNotes })
    persistNotes(nextNotes, get().notesPath)
  },
  renameNote: (oldFullPath, newPath, newName) => {
    const nameValidation = validateNoteName(newName)
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error)
    }

    const oldPath = normalizeNotePath(oldFullPath)
    const targetPath = normalizeNotePath(newPath)
    const targetFullPath = normalizeNotePath(
      targetPath ? `${targetPath}/${nameValidation.name}` : nameValidation.name
    )

    if (targetFullPath.startsWith(`${oldPath}/`)) {
      throw new Error('不能移动到自身子目录')
    }

    const conflict = get().notes.some(note => {
      const fullPath = getNoteFullPath(note)
      return fullPath !== oldPath && fullPath === targetFullPath
    })
    if (conflict) {
      throw new Error('目标位置已存在同名笔记')
    }

    const nextNotes = renameNotesByPath(
      get().notes,
      oldPath,
      targetPath,
      nameValidation.name
    )
    set({ notes: nextNotes })
    persistNotes(nextNotes, get().notesPath)
  },
  importNotes: notes => {
    const nextNotes = normalizeNotes(notes)
    set({ notes: nextNotes })
    persistNotes(nextNotes, get().notesPath)
  },
}))

// Initialize theme on module load (client-side only)
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('theme')
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  if (saved === 'dark' || (!saved && prefersDark)) {
    useAppStore.setState({ isDarkMode: true })
  }
}
