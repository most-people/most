import {
  calculateNoteCid,
  getNoteFullPath,
  NOTE_NAME_ERROR_CODES,
  normalizeNotePath,
  renameNotesByPath,
  validateNoteName,
} from '~server/src/utils/noteUtils.js'
import { create } from 'zustand'
import {
  checkBackendConnectionTarget,
  configureBackend,
  detectLocalhostBackend,
  getRemoteInviteExport,
  getRemoteUrlExport,
  setBackendUrl,
  setBackendInvite,
  getSameOriginBackendUrlExport,
} from '~server/src/utils/api'
import { getNotes, putNotes } from '~/lib/notesDb'
import { fileApi } from '~/lib/fileApi'
import type {
  ActiveDownloadStatus,
  ActiveDownloadTask,
  DownloadTaskOutcome,
  ParsedDownloadEvent,
} from '~/lib/downloadTasks'
import { excludeTerminalDownloadTasks } from '~/lib/downloadTasks'

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

  // Connect Modal
  showConnectModal: boolean
  openConnectModal: () => void
  closeConnectModal: () => void

  // Background CID downloads
  downloadTasks: ActiveDownloadTask[]
  downloadTaskOutcomes: DownloadTaskOutcome[]
  downloadTasksHydrated: boolean
  setDownloadTasksHydrated: (hydrated: boolean) => void
  loadDownloadTasks: () => Promise<ActiveDownloadTask[]>
  upsertDownloadTask: (task: ActiveDownloadTask) => void
  applyDownloadEvent: (event: ParsedDownloadEvent) => DownloadTaskOutcome | null
  markDownloadTaskCancelling: (taskId: string) => void
  dismissDownloadOutcome: (taskId: string) => void
  clearDownloadTasks: () => void

  localDataReady: boolean
  initializeLocalData: () => void

  // Notes
  notes: NoteItem[]
  notesPath: string
  notesAddress: string
  loadUserNotes: (address: string) => Promise<void>
  resetAppState: () => void
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

function normalizeNotes(input: unknown): NoteItem[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(note => {
      if (!note || typeof note !== 'object') return false
      const value = note as Partial<NoteItem>
      return value.type === 'file' || value.content !== undefined
    })
    .map(note => ({
      name: String((note as Partial<NoteItem>).name || 'Untitled'),
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

function persistNotes(address: string, notes: NoteItem[], notesPath: string) {
  if (!address) return
  putNotes(address, notes, normalizeNotePath(notesPath)).catch(err => {
    console.warn('Failed to persist notes:', err)
  })
}

function getNoteNameErrorKey(errorCode?: string) {
  switch (errorCode) {
    case NOTE_NAME_ERROR_CODES.EMPTY:
      return 'note.error.nameRequired'
    case NOTE_NAME_ERROR_CODES.SLASH:
      return 'note.error.nameNoSlash'
    case NOTE_NAME_ERROR_CODES.BACKSLASH:
      return 'note.error.nameNoBackslash'
    default:
      return 'note.error.nameInvalid'
  }
}

let downloadTasksRevision = 0

export const useAppStore = create<AppState>((set, get) => ({
  // Backend
  hasBackend: null,
  checkBackend: async () => {
    const remoteUrl = getRemoteUrlExport()
    if (remoteUrl) {
      const remoteInvite = getRemoteInviteExport()
      const { ok } = await checkBackendConnectionTarget({
        url: remoteUrl,
        invite: remoteInvite,
      })
      if (ok) {
        configureBackend({
          url: remoteUrl,
          invite: remoteInvite,
        })
        set({ hasBackend: true })
        return
      }
    }

    const localhost = await detectLocalhostBackend()
    if (localhost) {
      setBackendUrl('http://localhost:1976')
      setBackendInvite('')
      set({ hasBackend: true })
      return
    }

    const sameOrigin = getSameOriginBackendUrlExport()
    if (sameOrigin) {
      const { ok } = await checkBackendConnectionTarget({ url: sameOrigin })
      if (ok) {
        setBackendUrl('')
        setBackendInvite('')
        set({ hasBackend: true })
        return
      }
    }

    if (!remoteUrl) {
      setBackendUrl('')
      setBackendInvite('')
    }
    set({ hasBackend: false })
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

  // Connect Modal
  showConnectModal: false,
  openConnectModal: () => set({ showConnectModal: true }),
  closeConnectModal: () => set({ showConnectModal: false }),

  // Background CID downloads
  downloadTasks: [],
  downloadTaskOutcomes: [],
  downloadTasksHydrated: false,
  setDownloadTasksHydrated: downloadTasksHydrated => {
    set({ downloadTasksHydrated })
  },
  loadDownloadTasks: async () => {
    const revision = ++downloadTasksRevision
    const tasks = await fileApi.listDownloadTasks()
    if (revision !== downloadTasksRevision) {
      return get().downloadTasks
    }

    let activeTasks = tasks
    set(state => {
      activeTasks = excludeTerminalDownloadTasks(
        tasks,
        state.downloadTaskOutcomes
      )
      return { downloadTasks: activeTasks, downloadTasksHydrated: true }
    })
    return activeTasks
  },
  upsertDownloadTask: task => {
    downloadTasksRevision += 1
    set(state => ({
      downloadTasks: [
        task,
        ...state.downloadTasks.filter(item => item.taskId !== task.taskId),
      ],
      downloadTasksHydrated: true,
    }))
  },
  applyDownloadEvent: parsed => {
    const taskId = parsed.payload.taskId
    if (!taskId) return null
    const currentTask = get().downloadTasks.find(task => task.taskId === taskId)
    if (!currentTask) return null
    downloadTasksRevision += 1

    if (parsed.event === 'download:status') {
      const allowedStatuses: ActiveDownloadStatus[] = [
        'connecting',
        'finding-peers',
        'downloading',
        'verifying',
      ]
      const nextStatus = allowedStatuses.includes(
        parsed.payload.status as ActiveDownloadStatus
      )
        ? (parsed.payload.status as ActiveDownloadStatus)
        : currentTask.status
      set(state => ({
        downloadTasks: state.downloadTasks.map(task =>
          task.taskId === taskId
            ? { ...task, status: nextStatus, updatedAt: Date.now() }
            : task
        ),
        downloadTasksHydrated: true,
      }))
      return null
    }

    if (parsed.event === 'download:progress') {
      set(state => ({
        downloadTasks: state.downloadTasks.map(task =>
          task.taskId === taskId
            ? {
                ...task,
                status: 'downloading',
                kind:
                  parsed.payload.collection === true ? 'collection' : task.kind,
                progress: parsed.payload.percent ?? task.progress,
                loadedBytes:
                  parsed.payload.collection === true
                    ? 0
                    : (parsed.payload.loaded ?? task.loadedBytes),
                totalBytes:
                  parsed.payload.collection === true
                    ? 0
                    : (parsed.payload.total ?? task.totalBytes),
                completedFiles:
                  parsed.payload.collection === true
                    ? (parsed.payload.completedFiles ??
                      parsed.payload.loaded ??
                      task.completedFiles)
                    : task.completedFiles,
                totalFiles:
                  parsed.payload.collection === true
                    ? (parsed.payload.totalFiles ??
                      parsed.payload.total ??
                      task.totalFiles)
                    : task.totalFiles,
                updatedAt: Date.now(),
              }
            : task
        ),
        downloadTasksHydrated: true,
      }))
      return null
    }

    const outcomeStatus =
      parsed.event === 'download:success'
        ? parsed.payload.partial === true
          ? 'partial'
          : 'completed'
        : parsed.event === 'download:error'
          ? 'failed'
          : parsed.event === 'download:cancelled'
            ? 'cancelled'
            : null
    if (!outcomeStatus) return null

    const outcome: DownloadTaskOutcome = {
      taskId,
      cid: currentTask.cid,
      fileName: parsed.payload.fileName || currentTask.fileName,
      kind:
        parsed.payload.kind === 'collection' ? 'collection' : currentTask.kind,
      status: outcomeStatus,
      payload: parsed.payload,
      finishedAt: Date.now(),
    }
    set(state => ({
      downloadTasks: state.downloadTasks.filter(task => task.taskId !== taskId),
      downloadTaskOutcomes: [
        outcome,
        ...state.downloadTaskOutcomes.filter(item => item.taskId !== taskId),
      ].slice(0, 20),
      downloadTasksHydrated: true,
    }))
    return outcome
  },
  markDownloadTaskCancelling: taskId => {
    downloadTasksRevision += 1
    set(state => ({
      downloadTasks: state.downloadTasks.map(task =>
        task.taskId === taskId
          ? { ...task, status: 'cancelling', updatedAt: Date.now() }
          : task
      ),
    }))
  },
  dismissDownloadOutcome: taskId => {
    set(state => ({
      downloadTaskOutcomes: state.downloadTaskOutcomes.filter(
        outcome => outcome.taskId !== taskId
      ),
    }))
  },
  clearDownloadTasks: () => {
    downloadTasksRevision += 1
    set({
      downloadTasks: [],
      downloadTaskOutcomes: [],
      downloadTasksHydrated: true,
    })
  },

  localDataReady: false,
  initializeLocalData: () => {
    set({
      notes: [],
      notesPath: '',
      notesAddress: '',
      localDataReady: true,
    })
  },

  // Notes
  notes: [],
  notesPath: '',
  notesAddress: '',
  loadUserNotes: async address => {
    try {
      const data = await getNotes(address)
      set({
        notes: data ? normalizeNotes(data.notes) : [],
        notesPath: normalizeNotePath(data?.notesPath || ''),
        notesAddress: address,
      })
    } catch (err) {
      console.warn('Failed to load notes from IndexedDB:', err)
      set({ notes: [], notesPath: '', notesAddress: address })
    }
  },
  resetAppState: () => {
    set({
      notes: [],
      notesPath: '',
      notesAddress: '',
      toasts: [],
      showConnectModal: false,
      downloadTasks: [],
      downloadTaskOutcomes: [],
      downloadTasksHydrated: true,
    })
  },
  setNotesPath: path => {
    const notesPath = normalizeNotePath(path)
    set({ notesPath })
    persistNotes(get().notesAddress, get().notes, notesPath)
  },
  saveNote: async input => {
    const nameValidation = validateNoteName(input.name)
    if (!nameValidation.valid) {
      throw new Error(getNoteNameErrorKey(nameValidation.errorCode))
    }
    const validatedName = nameValidation.name || input.name

    const path = normalizeNotePath(input.path || '')
    const content = String(input.content || '')
    const cid = await calculateNoteCid(content)
    const size = new TextEncoder().encode(content).length
    const now = Date.now()

    const notes = get().notes
    const existingIndex = input.cid
      ? notes.findIndex(note => note.cid === input.cid)
      : notes.findIndex(
          note =>
            normalizeNotePath(note.path) === path && note.name === validatedName
        )
    const targetFullPath = normalizeNotePath(
      path ? `${path}/${validatedName}` : validatedName
    )
    const hasNameConflict = notes.some((note, index) => {
      return index !== existingIndex && getNoteFullPath(note) === targetFullPath
    })
    if (hasNameConflict) {
      throw new Error('note.error.nameConflict')
    }

    const existing = existingIndex >= 0 ? notes[existingIndex] : null
    const nextNote: NoteItem = {
      name: validatedName,
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
        ? notes.map((note, index) =>
            index === existingIndex ? nextNote : note
          )
        : [...notes, nextNote]

    set({ notes: nextNotes })
    persistNotes(get().notesAddress, nextNotes, get().notesPath)
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
    persistNotes(get().notesAddress, nextNotes, get().notesPath)
  },
  renameNote: (oldFullPath, newPath, newName) => {
    const nameValidation = validateNoteName(newName)
    if (!nameValidation.valid) {
      throw new Error(getNoteNameErrorKey(nameValidation.errorCode))
    }

    const oldPath = normalizeNotePath(oldFullPath)
    const targetPath = normalizeNotePath(newPath)
    const targetFullPath = normalizeNotePath(
      targetPath ? `${targetPath}/${nameValidation.name}` : nameValidation.name
    )

    if (targetFullPath.startsWith(`${oldPath}/`)) {
      throw new Error('note.error.moveIntoSelf')
    }

    const conflict = get().notes.some(note => {
      const fullPath = getNoteFullPath(note)
      return fullPath !== oldPath && fullPath === targetFullPath
    })
    if (conflict) {
      throw new Error('note.error.nameConflict')
    }

    const nextNotes = renameNotesByPath(
      get().notes,
      oldPath,
      targetPath,
      nameValidation.name
    )
    set({ notes: nextNotes })
    persistNotes(get().notesAddress, nextNotes, get().notesPath)
  },
  importNotes: notes => {
    const nextNotes = normalizeNotes(notes)
    set({ notes: nextNotes })
    persistNotes(get().notesAddress, nextNotes, get().notesPath)
  },
}))

// Initialize theme on module load (client-side only)
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('theme')
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDarkMode = saved === 'dark' || (!saved && prefersDark)
  document.documentElement.setAttribute(
    'data-theme',
    isDarkMode ? 'dark' : 'light'
  )
  useAppStore.setState({ isDarkMode })
}
