import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronUp,
  CircleStop,
  Download,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react'

import { fileApi } from '~/lib/fileApi'
import { formatBytes } from '~/lib/format'
import { useI18n } from '~/lib/i18n'
import {
  parseDownloadEvent,
  type ActiveDownloadStatus,
  type ActiveDownloadTask,
  type DownloadTaskOutcome,
} from '~/lib/downloadTasks'
import { buildCidSharePath } from '~/lib/shareLink'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import {
  getApiErrorMessage,
  getAuthenticatedWebSocketUrl,
} from '~server/src/utils/api'

const DOWNLOAD_EVENTS = new Set([
  'download:progress',
  'download:status',
  'download:success',
  'download:error',
  'download:cancelled',
])

export default function GlobalDownloadTasks() {
  return (
    <>
      <DownloadTaskSync />
      <DownloadTaskTray />
    </>
  )
}

function DownloadTaskSync() {
  const { t } = useI18n()
  const hasBackend = useAppStore(state => state.hasBackend)
  const addToast = useAppStore(state => state.addToast)
  const loadDownloadTasks = useAppStore(state => state.loadDownloadTasks)
  const setDownloadTasksHydrated = useAppStore(
    state => state.setDownloadTasksHydrated
  )
  const applyDownloadEvent = useAppStore(state => state.applyDownloadEvent)
  const clearDownloadTasks = useAppStore(state => state.clearDownloadTasks)
  const identity = useUserStore(state => state.identity)
  const identityAddress = identity?.address || ''

  useEffect(() => {
    clearDownloadTasks()
    setDownloadTasksHydrated(hasBackend !== true || !identityAddress)
  }, [
    clearDownloadTasks,
    hasBackend,
    identityAddress,
    setDownloadTasksHydrated,
  ])

  useEffect(() => {
    if (hasBackend !== true || !identityAddress) {
      return
    }

    let cancelled = false
    let ws: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempts = 0

    const hydrate = async () => {
      try {
        await loadDownloadTasks()
      } catch {
        if (!cancelled) setDownloadTasksHydrated(true)
      }
    }

    const notifyOutcome = (outcome: DownloadTaskOutcome) => {
      if (outcome.status === 'completed') {
        addToast(t('cid.toast.downloadComplete'), 'success')
        return
      }
      if (outcome.status === 'partial') {
        const downloadedFileCount =
          outcome.payload.downloadedFileCount ??
          outcome.payload.completedFiles ??
          0
        const totalFiles =
          outcome.payload.selectedFileCount ??
          outcome.payload.totalFiles ??
          outcome.payload.fileCount ??
          0
        addToast(
          t('cid.toast.collectionPartialComplete', {
            downloadedFileCount,
            totalFiles,
          }),
          'warning'
        )
        return
      }
      if (outcome.status === 'failed') {
        addToast(
          t('cid.toast.downloadFailed', {
            error: outcome.payload.error || t('cid.errorFallback'),
          }),
          'error'
        )
        return
      }
      addToast(t('cid.toast.cancelled'), 'warning')
    }

    const connect = async () => {
      await hydrate()
      if (cancelled) return

      try {
        const socket = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
        if (cancelled) {
          socket.close()
          return
        }
        ws = socket
        socket.onopen = () => {
          reconnectAttempts = 0
          void hydrate()
        }
        socket.onmessage = event => {
          const parsed = parseDownloadEvent(event.data)
          if (!parsed || !DOWNLOAD_EVENTS.has(parsed.event)) return

          const outcome = applyDownloadEvent(parsed)
          if (outcome) {
            notifyOutcome(outcome)
            return
          }

          if (
            parsed.payload.taskId &&
            !useAppStore
              .getState()
              .downloadTasks.some(
                task => task.taskId === parsed.payload.taskId
              ) &&
            (parsed.event === 'download:status' ||
              parsed.event === 'download:progress')
          ) {
            void hydrate()
          }
        }
        socket.onclose = () => {
          if (cancelled) return
          reconnectAttempts += 1
          const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000)
          reconnectTimer = window.setTimeout(connect, delay)
        }
      } catch {
        if (cancelled) return
        reconnectAttempts += 1
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000)
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }

    void connect()
    return () => {
      cancelled = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [
    addToast,
    applyDownloadEvent,
    hasBackend,
    identityAddress,
    loadDownloadTasks,
    setDownloadTasksHydrated,
    t,
  ])

  return null
}

function DownloadTaskTray() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const tasks = useAppStore(state => state.downloadTasks)
  const addToast = useAppStore(state => state.addToast)
  const loadDownloadTasks = useAppStore(state => state.loadDownloadTasks)
  const markCancelling = useAppStore(state => state.markDownloadTaskCancelling)
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsOpen(false)
      toggleRef.current?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (tasks.length === 0) return null

  const primaryTask = tasks[0]
  const toggleLabel = t(isOpen ? 'cid.tasks.close' : 'cid.tasks.open')
  const handleCancel = async (task: ActiveDownloadTask) => {
    if (task.status === 'cancelling') return
    markCancelling(task.taskId)
    try {
      await fileApi.cancelDownload(task.taskId)
    } catch (error) {
      await loadDownloadTasks().catch(() => {})
      addToast(
        await getApiErrorMessage(error, t('cid.toast.cancelFailed')),
        'error'
      )
    }
  }

  const handleView = (task: ActiveDownloadTask) => {
    setIsOpen(false)
    navigate({ href: buildCidSharePath(task.cid, task.fileName) })
  }

  return (
    <div className="global-download-tray">
      <button
        ref={toggleRef}
        type="button"
        className="global-download-toggle ui-glass-surface ui-glass-surface-interactive"
        onClick={() => setIsOpen(current => !current)}
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        <span className="ui-icon-tile">
          <Download size={18} />
        </span>
        <span className="global-download-toggle-copy">
          <strong translate="no">
            {tasks.length === 1
              ? primaryTask.fileName
              : t('cid.tasks.activeCount', { count: tasks.length })}
          </strong>
          <span>
            {tasks.length === 1
              ? `${primaryTask.progress}%`
              : t('cid.tasks.running')}
          </span>
        </span>
        {isOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
      </button>

      {isOpen && (
        <section
          id={panelId}
          className="global-download-panel ui-glass-surface ui-glass-surface-elevated"
          aria-label={t('cid.tasks.title')}
        >
          <header className="global-download-panel-header">
            <div>
              <strong>{t('cid.tasks.title')}</strong>
              <span>{t('cid.tasks.activeCount', { count: tasks.length })}</span>
            </div>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => {
                setIsOpen(false)
                toggleRef.current?.focus()
              }}
              aria-label={t('cid.tasks.close')}
              title={t('cid.tasks.close')}
            >
              <X size={17} />
            </button>
          </header>

          <div className="global-download-list">
            {tasks.map(task => (
              <article key={task.taskId} className="global-download-item">
                <div className="global-download-item-heading">
                  <Download size={16} />
                  <span translate="no">{task.fileName}</span>
                  <strong>{getTaskStatusLabel(task.status, t)}</strong>
                </div>
                <div className="global-download-progress-row">
                  <progress
                    className="ui-progress"
                    value={Math.max(0, Math.min(100, task.progress))}
                    max={100}
                    aria-label={t('cid.tasks.progressLabel', {
                      fileName: task.fileName,
                    })}
                    aria-valuetext={getTaskProgressLabel(task, t)}
                  />
                  <span>{getTaskProgressLabel(task, t)}</span>
                </div>
                <div className="global-download-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleView(task)}
                    aria-label={t('cid.tasks.viewFile', {
                      fileName: task.fileName,
                    })}
                  >
                    <ExternalLink size={15} />
                    <span>{t('cid.tasks.view')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={task.status === 'cancelling'}
                    onClick={() => handleCancel(task)}
                    aria-label={t('cid.tasks.cancelFile', {
                      fileName: task.fileName,
                    })}
                  >
                    {task.status === 'cancelling' ? (
                      <Loader2 className="ui-spinner" size={15} />
                    ) : (
                      <CircleStop size={15} />
                    )}
                    <span>{t('cid.cancelAction')}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function getTaskStatusLabel(
  status: ActiveDownloadStatus,
  t: ReturnType<typeof useI18n>['t']
) {
  return t(`cid.tasks.status.${status}`)
}

function getTaskProgressLabel(
  task: ActiveDownloadTask,
  t: ReturnType<typeof useI18n>['t']
) {
  if (task.totalBytes > 0) {
    return `${formatBytes(task.loadedBytes)} / ${formatBytes(task.totalBytes)}`
  }
  if (task.totalFiles > 0) {
    return t('cid.tasks.collectionProgress', {
      completedFiles: task.completedFiles,
      totalFiles: task.totalFiles,
    })
  }
  return `${task.progress}%`
}
