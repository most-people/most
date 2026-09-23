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
import { fileApi } from '~/lib/fileApi'
import type {
  ActiveDownloadStatus,
  ActiveDownloadTask,
  DownloadTaskOutcome,
  ParsedDownloadEvent,
} from '~/lib/downloadTasks'
import { excludeTerminalDownloadTasks } from '~/lib/downloadTasks'
import {
  normalizeAppearancePreference,
  resolveAppearancePreference,
  type AppearancePreference,
} from '~/lib/appearance'

interface ToastItem {
  id: number
  message: string
  type: string
}

interface AppState {
  // Backend
  hasBackend: boolean | null
  activeBackendUrl: string
  checkBackend: () => Promise<void>

  // Theme
  appearance: AppearancePreference
  setAppearance: (appearance: AppearancePreference) => void

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

  resetAppState: () => void
}

let downloadTasksRevision = 0

export const useAppStore = create<AppState>((set, get) => ({
  // Backend
  hasBackend: null,
  activeBackendUrl: '',
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
        set({ hasBackend: true, activeBackendUrl: remoteUrl })
        return
      }
    }

    const localhost = await detectLocalhostBackend()
    if (localhost) {
      setBackendUrl('http://localhost:1976')
      setBackendInvite('')
      set({
        hasBackend: true,
        activeBackendUrl: 'http://localhost:1976',
      })
      return
    }

    const sameOrigin = getSameOriginBackendUrlExport()
    if (sameOrigin) {
      const { ok } = await checkBackendConnectionTarget({ url: sameOrigin })
      if (ok) {
        setBackendUrl('')
        setBackendInvite('')
        set({ hasBackend: true, activeBackendUrl: sameOrigin })
        return
      }
    }

    if (!remoteUrl) {
      setBackendUrl('')
      setBackendInvite('')
    }
    set({ hasBackend: false, activeBackendUrl: '' })
  },

  // Theme
  appearance: 'system',
  setAppearance: appearance => {
    const resolvedAppearance = resolveAppearancePreference(
      appearance,
      window.matchMedia('(prefers-color-scheme: dark)').matches
    )
    set({ appearance })
    document.documentElement.setAttribute('data-theme', resolvedAppearance)
    document.documentElement.setAttribute('data-theme-preference', appearance)
    localStorage.setItem('theme', appearance)
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
    set({ localDataReady: true })
  },

  resetAppState: () => {
    set({
      toasts: [],
      showConnectModal: false,
      downloadTasks: [],
      downloadTaskOutcomes: [],
      downloadTasksHydrated: true,
    })
  },
}))

// Initialize theme on module load (client-side only)
if (typeof window !== 'undefined') {
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
  const appearance = normalizeAppearancePreference(
    localStorage.getItem('theme')
  )
  const resolvedAppearance = resolveAppearancePreference(
    appearance,
    systemTheme.matches
  )

  document.documentElement.setAttribute('data-theme', resolvedAppearance)
  document.documentElement.setAttribute('data-theme-preference', appearance)
  useAppStore.setState({ appearance })

  systemTheme.addEventListener('change', event => {
    if (useAppStore.getState().appearance !== 'system') return
    const nextAppearance = event.matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', nextAppearance)
  })
}
