import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from '@tanstack/react-router'
import { QRCodeCanvas } from 'qrcode.react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  FolderOpen,
  HardDrive,
  Loader2,
  LogIn,
  QrCode,
  RefreshCw,
  WifiOff,
  XCircle,
} from 'lucide-react'

import {
  DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS,
  fileApi,
  getDownloadCheckErrorMessage,
  type DownloadCheckResponse,
} from '~/lib/fileApi'
import { formatBytes } from '~/lib/format'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import { MarketingHeader } from '~/components/MarketingHeader'
import { useClipboard, useCountdownSeconds } from '~/hooks'
import { useI18n } from '~/lib/i18n'
import { buildCidShareLink } from '~/lib/shareLink'
import {
  normalizeDownloadErrorPayload,
  type DownloadEventPayload,
} from '~/lib/downloadTasks'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { getApiErrorMessage, getApiErrorPayload } from '~server/src/utils/api'
import { parseMostLink } from '~server/src/core/mostLink.js'

type CheckStatus =
  | 'idle'
  | 'waiting-backend'
  | 'login-required'
  | 'backend-missing'
  | 'checking'
  | 'available'
  | 'local-available'
  | 'already-local'
  | 'error'

type DownloadStatus =
  | 'idle'
  | 'starting'
  | 'downloading'
  | 'partial'
  | 'completed'
  | 'error'
  | 'cancelled'

type CheckState = {
  status: CheckStatus
  message: string
}

type DownloadState = {
  status: DownloadStatus
  message: string
}

type CidProcessStepKey = 'open' | 'check' | 'verify' | 'seed'

const HANDOFF_FALLBACK_DELAY_MS = 1800
const EMPTY_COLLECTION_FILES: NonNullable<DownloadCheckResponse['files']> = []

function isDownloadCheckFullyLocal(result: DownloadCheckResponse) {
  if (result.alreadyExists === true) return true
  if (result.kind === 'collection') {
    const fileCount = result.fileCount ?? result.files?.length ?? 0
    return fileCount > 0 && result.missingLocalCount === 0
  }
  return result.localAvailable === true
}

function buildMostLinkFromRoute(cid: string, searchStr: string) {
  return `most://${cid}${searchStr || ''}`
}

function getFileNameFromSearch(searchStr: string) {
  const queryString = searchStr.startsWith('?') ? searchStr.slice(1) : searchStr
  const fileName = new URLSearchParams(queryString).get('filename')?.trim()
  return fileName || undefined
}

function getQrCodeFileName(cid: string) {
  return `mostbox-${cid.slice(0, 12)}-share-qr.png`
}

function formatDownloadPath(dataPath: string, fallback: string) {
  const cleaned = dataPath.trim().replace(/[\\/]+$/, '')
  if (!cleaned) return fallback
  return cleaned
}

function getDownloadErrorCopy(
  payload: DownloadEventPayload,
  fallbackMessage: string,
  t: ReturnType<typeof useI18n>['t']
) {
  if (
    payload.errorCode === 'COLLECTION_CHILD_UNAVAILABLE' ||
    payload.details?.kind === 'collection-child'
  ) {
    const fileName =
      payload.details?.childPath ||
      payload.details?.fileName ||
      payload.details?.childCid ||
      t('cid.errorFallback')
    const collectionName = payload.details?.collectionName || fileName

    return {
      message: t('cid.status.collectionChildUnavailable', {
        collectionName,
        fileName,
      }),
      toast: t('cid.toast.collectionChildUnavailable', { fileName }),
    }
  }

  const error = payload.error || t('cid.errorFallback')
  return {
    message: payload.error || fallbackMessage,
    toast: t('cid.toast.downloadFailed', { error }),
  }
}

function getDownloadSuccessCopy(
  payload: DownloadEventPayload,
  fallbackFileName: string,
  t: ReturnType<typeof useI18n>['t']
) {
  if (payload.kind === 'collection' && payload.partial === true) {
    const totalFiles =
      payload.selectedFileCount ?? payload.totalFiles ?? payload.fileCount ?? 0
    const downloadedFileCount =
      payload.downloadedFileCount ?? payload.completedFiles ?? 0
    const unavailableFileCount =
      payload.unavailableFileCount ??
      Math.max(totalFiles - downloadedFileCount, 0)

    if (downloadedFileCount > 0) {
      return {
        message: t('cid.status.collectionPartialComplete', {
          downloadedFileCount,
          totalFiles,
          unavailableFileCount,
        }),
        toast: t('cid.toast.collectionPartialComplete', {
          downloadedFileCount,
          totalFiles,
        }),
        toastType: 'warning',
      }
    }

    return {
      message: t('cid.status.collectionNoFilesDownloaded', {
        totalFiles,
      }),
      toast: t('cid.toast.collectionNoFilesDownloaded'),
      toastType: 'warning',
    }
  }

  return {
    message: t('cid.status.downloadComplete', {
      fileName: payload.fileName || fallbackFileName,
    }),
    toast: t('cid.toast.downloadComplete'),
    toastType: 'success',
  }
}

export default function CidPage() {
  const { t } = useI18n()
  const { cid } = useParams({ from: '/cid/$cid/' })
  const searchStr = useLocation({ select: location => location.searchStr })
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const downloadTasksHydrated = useAppStore(s => s.downloadTasksHydrated)
  const activeDownloadTask = useAppStore(
    s => s.downloadTasks.find(task => task.cid === cid) ?? null
  )
  const latestDownloadOutcome = useAppStore(
    s => s.downloadTaskOutcomes.find(outcome => outcome.cid === cid) ?? null
  )
  const loadDownloadTasks = useAppStore(s => s.loadDownloadTasks)
  const upsertDownloadTask = useAppStore(s => s.upsertDownloadTask)
  const markDownloadTaskCancelling = useAppStore(
    s => s.markDownloadTaskCancelling
  )
  const dismissDownloadOutcome = useAppStore(s => s.dismissDownloadOutcome)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const { copy: copyWebShareLink, copied: webShareLinkCopied } = useClipboard({
    timeout: 2000,
  })

  const mostLink = useMemo(
    () => buildMostLinkFromRoute(cid, searchStr),
    [cid, searchStr]
  )
  const shareFileName = useMemo(
    () => getFileNameFromSearch(searchStr),
    [searchStr]
  )
  const webShareLink = useMemo(
    () => buildCidShareLink(cid, shareFileName),
    [cid, shareFileName]
  )
  const parsedLink = useMemo(() => parseMostLink(mostLink), [mostLink])
  const validationMessage = useMemo(
    () => getLocalizedDownloadLinkValidationMessage(mostLink, t),
    [mostLink, t]
  )
  const initialFileName = parsedLink.fileName || cid

  const [checkState, setCheckState] = useState<CheckState>({
    status: 'idle',
    message: '',
  })
  const checkRemainingSeconds = useCountdownSeconds(
    checkState.status === 'checking',
    DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS
  )
  const [checkResult, setCheckResult] = useState<DownloadCheckResponse | null>(
    null
  )
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: 'idle',
    message: '',
  })
  const [selectedCollectionPaths, setSelectedCollectionPaths] = useState<
    string[]
  >([])
  const [downloadPath, setDownloadPath] = useState('')
  const [showHandoffFallback, setShowHandoffFallback] = useState(false)
  const checkSeqRef = useRef(0)
  const handoffTimerRef = useRef<number | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const processedOutcomeRef = useRef('')

  const taskId = activeDownloadTask?.taskId || ''
  const progress = activeDownloadTask?.progress ?? 0
  const loadedBytes = activeDownloadTask?.loadedBytes ?? null
  const totalBytes = activeDownloadTask?.totalBytes ?? null
  const collectionProgress =
    activeDownloadTask && activeDownloadTask.totalFiles > 0
      ? {
          completedFiles: activeDownloadTask.completedFiles,
          totalFiles: activeDownloadTask.totalFiles,
        }
      : null
  const fileName =
    checkResult?.fileName ||
    activeDownloadTask?.fileName ||
    latestDownloadOutcome?.fileName ||
    initialFileName
  const fileSize = checkResult?.size ?? totalBytes
  const isCollectionResult =
    checkResult?.kind === 'collection' ||
    activeDownloadTask?.kind === 'collection' ||
    latestDownloadOutcome?.kind === 'collection'
  const collectionFiles = checkResult?.files ?? EMPTY_COLLECTION_FILES
  const collectionFileCount = checkResult?.fileCount ?? collectionFiles.length
  const collectionLocalCount = checkResult?.localAvailableCount ?? 0
  const collectionMissingCount =
    checkResult?.missingLocalCount ??
    Math.max(collectionFileCount - collectionLocalCount, 0)
  const isAddingLocalContent = checkState.status === 'local-available'
  const canStartDownload =
    (checkState.status === 'available' || isAddingLocalContent) &&
    (!isCollectionResult || selectedCollectionPaths.length > 0)
  const isDownloading =
    Boolean(activeDownloadTask) || downloadState.status === 'starting'
  const isPartialDownload = downloadState.status === 'partial'

  const displayDownloadPath = formatDownloadPath(
    downloadPath,
    t('cid.saveToFallback')
  )
  const cidProcessSteps: Array<{
    key: CidProcessStepKey
    title: string
    desc: string
  }> = [
    {
      key: 'open',
      title: t('cid.process.step.open.title'),
      desc: t('cid.process.step.open.desc'),
    },
    {
      key: 'check',
      title: t('cid.process.step.check.title'),
      desc: t('cid.process.step.check.desc'),
    },
    {
      key: 'verify',
      title: isAddingLocalContent
        ? t('cid.process.step.addLocal.title')
        : t('cid.process.step.verify.title'),
      desc: isAddingLocalContent
        ? t('cid.process.step.addLocal.desc')
        : t('cid.process.step.verify.desc'),
    },
    {
      key: 'seed',
      title: t('cid.process.step.seed.title'),
      desc: t('cid.process.step.seed.desc'),
    },
  ]
  const cidProcessActiveIndex = getCidProcessActiveIndex(
    checkState.status,
    downloadState.status,
    isAddingLocalContent
  )

  const runCheck = useCallback(
    async (preserveDownloadState = false) => {
      const seq = checkSeqRef.current + 1
      checkSeqRef.current = seq
      setSelectedCollectionPaths([])
      if (!preserveDownloadState) {
        setDownloadState({ status: 'idle', message: '' })
      }

      if (validationMessage) {
        setCheckResult(null)
        setCheckState({ status: 'error', message: validationMessage })
        return
      }

      if (hasBackend === null) {
        setCheckResult(null)
        setCheckState({
          status: 'waiting-backend',
          message: t('cid.status.waitingBackend'),
        })
        return
      }

      if (hasBackend !== true) {
        setCheckResult(null)
        setCheckState({
          status: 'backend-missing',
          message: t('cid.status.backendMissing'),
        })
        return
      }

      if (!userIdentity) {
        setCheckResult(null)
        setCheckState({
          status: 'login-required',
          message: t('cid.status.loginRequired'),
        })
        return
      }

      setCheckState({ status: 'checking', message: '' })
      setCheckResult(null)

      try {
        const result = await fileApi.checkDownload(mostLink)
        if (checkSeqRef.current !== seq) return
        setCheckResult(result)
        if (result.kind === 'collection' && result.files?.length) {
          const missingPaths = result.files
            .filter(file => file.localAvailable !== true)
            .map(file => file.path)
          setSelectedCollectionPaths(
            missingPaths.length > 0
              ? missingPaths
              : result.files.map(file => file.path)
          )
        }
        const isCollection = result.kind === 'collection'
        const isFullyLocal = isDownloadCheckFullyLocal(result)
        setCheckState({
          status: result.alreadyExists
            ? 'already-local'
            : isFullyLocal
              ? 'local-available'
              : 'available',
          message: isCollection
            ? result.alreadyExists
              ? t('cid.status.collectionAlreadyLocal', {
                  fileName: result.fileName,
                })
              : isFullyLocal
                ? t('cid.status.collectionLocalAvailable', {
                    fileName: result.fileName,
                  })
                : t('cid.status.collectionAvailable', {
                    fileName: result.fileName,
                  })
            : result.alreadyExists
              ? t('cid.status.alreadyLocal', { fileName: result.fileName })
              : isFullyLocal
                ? t('cid.status.localAvailable', { fileName: result.fileName })
                : t('cid.status.available', { fileName: result.fileName }),
        })
      } catch (err) {
        if (checkSeqRef.current !== seq) return
        const message = await getDownloadCheckErrorMessage(err)
        setCheckState({ status: 'error', message })
        setCheckResult(null)
      }
    },
    [hasBackend, mostLink, t, userIdentity, validationMessage]
  )

  useEffect(() => {
    document.title = t('cid.meta.title')
  }, [t])

  useEffect(() => {
    const clearHandoffTimer = () => {
      if (handoffTimerRef.current === null) return
      window.clearTimeout(handoffTimerRef.current)
      handoffTimerRef.current = null
    }

    const handlePageHidden = () => {
      if (document.visibilityState !== 'hidden') return
      clearHandoffTimer()
      setShowHandoffFallback(false)
    }

    document.addEventListener('visibilitychange', handlePageHidden)
    window.addEventListener('pagehide', handlePageHidden)

    return () => {
      clearHandoffTimer()
      document.removeEventListener('visibilitychange', handlePageHidden)
      window.removeEventListener('pagehide', handlePageHidden)
    }
  }, [])

  useEffect(() => {
    if (!downloadTasksHydrated || activeDownloadTask) return
    void runCheck(Boolean(latestDownloadOutcome))
  }, [
    activeDownloadTask,
    downloadTasksHydrated,
    latestDownloadOutcome,
    runCheck,
  ])

  useEffect(() => {
    if (hasBackend !== true) return
    let cancelled = false
    fileApi
      .getDataPath()
      .then(result => {
        if (!cancelled) setDownloadPath(result.dataPath)
      })
      .catch(() => {
        if (!cancelled) setDownloadPath('')
      })
    return () => {
      cancelled = true
    }
  }, [hasBackend])

  useEffect(() => {
    if (!activeDownloadTask) return
    setDownloadState({
      status: 'downloading',
      message:
        activeDownloadTask.status === 'downloading'
          ? t('cid.status.downloading')
          : t(`cid.tasks.status.${activeDownloadTask.status}`),
    })
    setCheckState(current =>
      current.status === 'already-local'
        ? current
        : { status: 'available', message: t('cid.status.downloading') }
    )
  }, [activeDownloadTask, t])

  useEffect(() => {
    if (
      !latestDownloadOutcome ||
      processedOutcomeRef.current === latestDownloadOutcome.taskId
    ) {
      return
    }
    processedOutcomeRef.current = latestDownloadOutcome.taskId
    const payload = latestDownloadOutcome.payload

    if (
      latestDownloadOutcome.status === 'completed' ||
      latestDownloadOutcome.status === 'partial'
    ) {
      const successCopy = getDownloadSuccessCopy(payload, fileName, t)
      const completedCollection =
        isCollectionResult || payload.kind === 'collection'
      const unavailablePathList = payload.unavailablePaths ?? []
      const downloadedPaths = new Set(payload.downloadedPaths)
      const unavailablePaths = new Set(unavailablePathList)
      const nextCollectionFiles = completedCollection
        ? collectionFiles.map(file => ({
            ...file,
            localAvailable: downloadedPaths.has(file.path)
              ? true
              : unavailablePaths.has(file.path)
                ? false
                : file.localAvailable,
          }))
        : collectionFiles
      const nextLocalCount = nextCollectionFiles.filter(
        file => file.localAvailable === true
      ).length
      const expectedCollectionFileCount =
        payload.fileCount ?? collectionFileCount
      const collectionFullyLocal = completedCollection
        ? nextCollectionFiles.length > 0
          ? nextLocalCount === nextCollectionFiles.length
          : payload.partial !== true &&
            (payload.downloadedFileCount ?? 0) >= expectedCollectionFileCount
        : false
      const fullyLocal = !completedCollection || collectionFullyLocal

      setDownloadState({
        status:
          completedCollection && payload.partial === true && !fullyLocal
            ? 'partial'
            : 'completed',
        message: successCopy.message,
      })
      setCheckResult(current =>
        current
          ? {
              ...current,
              alreadyExists: fullyLocal,
              localAvailable: fullyLocal,
              ...(completedCollection
                ? {
                    files: nextCollectionFiles,
                    localAvailableCount: nextLocalCount,
                    missingLocalCount: Math.max(
                      nextCollectionFiles.length - nextLocalCount,
                      0
                    ),
                  }
                : {}),
            }
          : current
      )

      if (fullyLocal) {
        setSelectedCollectionPaths([])
        setCheckState({
          status: 'already-local',
          message: completedCollection
            ? t('cid.status.collectionAlreadyLocal', { fileName })
            : t('cid.status.alreadyLocal', { fileName }),
        })
      } else if (payload.partial === true) {
        const retryPaths =
          unavailablePathList.length > 0
            ? unavailablePathList
            : nextCollectionFiles
                .filter(file => file.localAvailable !== true)
                .map(file => file.path)
        setSelectedCollectionPaths(retryPaths)
      }
      return
    }

    if (latestDownloadOutcome.status === 'failed') {
      const errorCopy = getDownloadErrorCopy(
        payload,
        t('cid.status.downloadFailed', { error: t('cid.errorFallback') }),
        t
      )
      setDownloadState({ status: 'error', message: errorCopy.message })
      return
    }

    setDownloadState({
      status: 'cancelled',
      message: t('cid.status.cancelled'),
    })
  }, [
    collectionFileCount,
    collectionFiles,
    fileName,
    isCollectionResult,
    latestDownloadOutcome,
    t,
  ])

  const handleStartDownload = async () => {
    if (!userIdentity) {
      openLoginModal()
      return
    }

    if (hasBackend !== true) {
      openConnectModal()
      return
    }

    if (!canStartDownload || isDownloading) return

    if (latestDownloadOutcome) {
      dismissDownloadOutcome(latestDownloadOutcome.taskId)
      processedOutcomeRef.current = ''
    }

    setDownloadState({
      status: 'starting',
      message: isAddingLocalContent
        ? t('cid.status.addingToLibrary')
        : t('cid.status.startingDownload'),
    })

    try {
      const result = await fileApi.downloadFileInBackground(
        mostLink,
        isCollectionResult ? selectedCollectionPaths : undefined
      )
      if (
        isAddingLocalContent &&
        (!isCollectionResult ||
          result.alreadyExists === true ||
          Array.isArray(result.files))
      ) {
        const message = isCollectionResult
          ? t('cid.status.collectionAlreadyLocal', { fileName })
          : t('cid.status.alreadyLocal', { fileName })
        setCheckResult(current =>
          current ? { ...current, alreadyExists: true } : current
        )
        setCheckState({ status: 'already-local', message })
        setDownloadState({
          status: 'completed',
          message: t('cid.status.addedToLibrary', { fileName }),
        })
        addToast(t('cid.toast.addedToLibrary'), 'success')
        return
      }

      if (result.alreadyExists) {
        setCheckResult(current =>
          current
            ? { ...current, alreadyExists: true, localAvailable: true }
            : current
        )
        setCheckState({
          status: 'already-local',
          message: isCollectionResult
            ? t('cid.status.collectionAlreadyLocal', {
                fileName: result.fileName || fileName,
              })
            : t('cid.status.alreadyLocal', {
                fileName: result.fileName || fileName,
              }),
        })
        setSelectedCollectionPaths([])
        setDownloadState({
          status: 'completed',
          message: t('cid.status.alreadyLocal', {
            fileName: result.fileName || fileName,
          }),
        })
        addToast(t('cid.toast.alreadyLocal'), 'warning')
        return
      }

      if (result.taskId) {
        const now = Date.now()
        upsertDownloadTask({
          taskId: result.taskId,
          cid,
          fileName: result.fileName || fileName,
          kind: isCollectionResult ? 'collection' : 'file',
          status: 'starting',
          progress: 0,
          loadedBytes: 0,
          totalBytes: 0,
          completedFiles: 0,
          totalFiles: isCollectionResult ? collectionFileCount : 0,
          startedAt: now,
          updatedAt: now,
        })
        setDownloadState({
          status: 'downloading',
          message: isAddingLocalContent
            ? t('cid.status.addingToLibrary')
            : t('cid.status.downloading'),
        })
        addToast(t('cid.toast.backgroundStarted'), 'info')
        void loadDownloadTasks()
          .then(tasks => {
            if (tasks.some(task => task.taskId === result.taskId)) return
            if (
              useAppStore
                .getState()
                .downloadTaskOutcomes.some(
                  outcome => outcome.taskId === result.taskId
                )
            ) {
              return
            }
            void runCheck()
          })
          .catch(() => {})
      }
    } catch (err) {
      const fallbackMessage = t('cid.status.downloadFailed', {
        error: t('cid.errorFallback'),
      })
      const apiErrorPayload = await getApiErrorPayload(err)
      const errorCopy = getDownloadErrorCopy(
        normalizeDownloadErrorPayload(apiErrorPayload),
        await getApiErrorMessage(err, fallbackMessage),
        t
      )
      setDownloadState({ status: 'error', message: errorCopy.message })
      addToast(errorCopy.toast, 'error')
    }
  }

  const handleOpenMostBox = () => {
    setShowHandoffFallback(false)

    if (handoffTimerRef.current !== null) {
      window.clearTimeout(handoffTimerRef.current)
    }

    handoffTimerRef.current = window.setTimeout(() => {
      handoffTimerRef.current = null
      if (document.visibilityState !== 'hidden') {
        setShowHandoffFallback(true)
      }
    }, HANDOFF_FALLBACK_DELAY_MS)
  }

  const handleCancelDownload = async () => {
    if (!taskId) return
    const cancelledTaskId = taskId
    markDownloadTaskCancelling(cancelledTaskId)

    try {
      await fileApi.cancelDownload(cancelledTaskId)
    } catch (err) {
      await loadDownloadTasks().catch(() => {})
      addToast(
        await getApiErrorMessage(err, t('cid.toast.cancelFailed')),
        'error'
      )
    }
  }

  const handleCopyWebShareLink = () => {
    copyWebShareLink(webShareLink)
    addToast(t('common.copied'), 'success')
  }

  const handleDownloadQrCode = () => {
    const canvas = qrCanvasRef.current
    if (!canvas) return

    const anchor = document.createElement('a')
    anchor.href = canvas.toDataURL('image/png')
    anchor.download = getQrCodeFileName(cid)
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    addToast(t('cid.toast.qrDownloaded'), 'success')
  }

  const renderCidProcessAction = (stepKey: CidProcessStepKey) => {
    switch (stepKey) {
      case 'open':
        return (
          <button
            type="button"
            className={`btn btn-secondary ${webShareLinkCopied ? 'copied' : ''}`}
            aria-label={t('cid.copyWebShareLink')}
            title={t('cid.copyWebShareLink')}
            onClick={handleCopyWebShareLink}
          >
            {webShareLinkCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>
              {webShareLinkCopied
                ? t('common.copied')
                : t('cid.copyLinkAction')}
            </span>
          </button>
        )
      case 'check':
        if (checkState.status === 'login-required') {
          return (
            <button className="btn btn-primary" onClick={openLoginModal}>
              <LogIn size={16} />
              <span>{t('cid.loginAction')}</span>
            </button>
          )
        }
        if (checkState.status === 'backend-missing') {
          return (
            <button className="btn btn-primary" onClick={openConnectModal}>
              <WifiOff size={16} />
              <span>{t('cid.connectAction')}</span>
            </button>
          )
        }
        return (
          <button
            className="btn btn-secondary"
            disabled={checkState.status === 'checking'}
            onClick={() => runCheck()}
          >
            <RefreshCw size={16} />
            <span>{t('cid.retryAction')}</span>
          </button>
        )
      case 'verify':
        return (
          <div className="cid-process-action-stack">
            <button
              className="btn btn-primary"
              disabled={!canStartDownload || isDownloading}
              onClick={handleStartDownload}
            >
              {isDownloading ? (
                <Loader2 className="cid-spin-icon" size={16} />
              ) : isPartialDownload ? (
                <RefreshCw size={16} />
              ) : checkState.status === 'already-local' ? (
                <Check size={16} />
              ) : isAddingLocalContent ? (
                <FolderInput size={16} />
              ) : (
                <Download size={16} />
              )}
              <span>
                {isDownloading
                  ? isAddingLocalContent
                    ? t('cid.addingToLibraryAction')
                    : t('cid.downloadingAction')
                  : isPartialDownload
                    ? t('cid.retryUnavailableAction')
                    : checkState.status === 'already-local'
                      ? t('cid.inLibraryAction')
                      : isAddingLocalContent
                        ? t('cid.addToLibraryAction')
                        : t('cid.startAction')}
              </span>
            </button>
            {activeDownloadTask && downloadState.status === 'downloading' && (
              <button
                className="btn btn-secondary"
                disabled={activeDownloadTask.status === 'cancelling'}
                onClick={handleCancelDownload}
              >
                <XCircle size={16} />
                <span>{t('cid.cancelAction')}</span>
              </button>
            )}
          </div>
        )
      case 'seed':
        return (
          <Link to="/app/" className="btn btn-secondary">
            <FolderOpen size={16} />
            <span>{t('cid.viewFileAction')}</span>
          </Link>
        )
    }
  }

  const statusIcon = getStatusIcon(checkState.status, downloadState.status)
  const statusClass = isPartialDownload ? 'partial' : checkState.status

  return (
    <div className="cid-layout">
      <MarketingHeader />
      <main className="cid-page">
        <section className="cid-shell">
          <div className="cid-heading">
            <span className="cid-kicker">{t('cid.transfer.kicker')}</span>
            <h1>{t('cid.transfer.title')}</h1>
            <p>{t('cid.transfer.subtitle')}</p>
          </div>

          <div className="cid-workspace">
            <div className="cid-panel cid-main-panel ui-glass-surface ui-glass-surface-elevated">
              <ol
                className="cid-process-steps"
                aria-label={t('cid.transfer.title')}
              >
                {cidProcessSteps.map((step, index) => (
                  <li
                    key={step.key}
                    className={`cid-process-step ${index === cidProcessActiveIndex ? 'active' : ''}`}
                    aria-current={
                      index === cidProcessActiveIndex ? 'step' : undefined
                    }
                  >
                    <span className="cid-process-index">{index + 1}</span>
                    <strong>{step.title}</strong>
                    <span className="cid-process-desc">{step.desc}</span>
                    <div className="cid-process-action">
                      {renderCidProcessAction(step.key)}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="cid-status">
                <span className={`cid-status-icon ${statusClass}`}>
                  {statusIcon}
                </span>
                <div>
                  <p className="cid-status-label">
                    {getStatusLabel(checkState.status, t)}
                  </p>
                  <p className="cid-status-message">
                    {checkState.status === 'checking'
                      ? t('cid.status.checking', {
                          seconds: checkRemainingSeconds,
                        })
                      : checkState.message}
                  </p>
                </div>
              </div>

              <dl className="cid-details">
                <div>
                  <dt>
                    <FileText size={16} />
                    {t('cid.fileNameLabel')}
                  </dt>
                  <dd>{fileName}</dd>
                </div>
                <div>
                  <dt>{t('cid.cidLabel')}</dt>
                  <dd className="cid-mono">{cid}</dd>
                </div>
                <div>
                  <dt>{t('cid.sizeLabel')}</dt>
                  <dd>
                    {fileSize ? formatBytes(fileSize) : t('cid.unknownSize')}
                  </dd>
                </div>
                <div>
                  <dt>
                    <HardDrive size={16} />
                    {t('cid.saveToLabel')}
                  </dt>
                  <dd>{displayDownloadPath}</dd>
                </div>
              </dl>

              {isCollectionResult && (
                <div className="cid-collection-summary">
                  <p>
                    {collectionMissingCount === 0
                      ? t('cid.collectionSummaryLocal', {
                          fileCount: collectionFileCount,
                        })
                      : t('cid.collectionSummary', {
                          fileCount: collectionFileCount,
                          localAvailableCount: collectionLocalCount,
                          missingLocalCount: collectionMissingCount,
                        })}
                  </p>
                </div>
              )}

              {isCollectionResult && collectionFiles.length > 0 && (
                <div className="cid-collection-files">
                  <h2>{t('cid.collectionSelectionTitle')}</h2>
                  <div className="cid-collection-list">
                    {collectionFiles.map(file => {
                      const checked = selectedCollectionPaths.includes(
                        file.path
                      )
                      return (
                        <label key={file.path} className="cid-collection-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isDownloading}
                            onChange={() => {
                              setSelectedCollectionPaths(current =>
                                checked
                                  ? current.filter(path => path !== file.path)
                                  : [...current, file.path]
                              )
                            }}
                          />
                          <span className="cid-collection-name" translate="no">
                            {file.path}
                          </span>
                          <span className="cid-collection-size">
                            {formatBytes(file.size)}
                          </span>
                          <span
                            className={`cid-collection-status ${
                              file.localAvailable === true ? 'is-local' : ''
                            }`}
                          >
                            {file.localAvailable === true && (
                              <Check size={14} />
                            )}
                            {file.localAvailable === true
                              ? t('cid.collectionChildLocal')
                              : t('cid.collectionChildDownloadCheck')}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {downloadState.status !== 'idle' && (
                <div className={`cid-download-state ${downloadState.status}`}>
                  <p>{downloadState.message}</p>
                  {(downloadState.status === 'starting' ||
                    downloadState.status === 'downloading') && (
                    <div className="cid-progress">
                      <progress
                        className="cid-progress-bar"
                        value={progress}
                        max={100}
                      />
                      <span>
                        {loadedBytes !== null && totalBytes !== null
                          ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
                          : collectionProgress
                            ? `${collectionProgress.completedFiles} / ${collectionProgress.totalFiles}`
                            : `${progress}%`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside
              className="cid-share-panel ui-glass-surface ui-glass-surface-elevated"
              aria-labelledby="cid-share-title"
            >
              <div className="cid-share-heading">
                <div>
                  <h2 id="cid-share-title">{t('cid.share.title')}</h2>
                  <p>{t('cid.share.desc')}</p>
                </div>
              </div>

              <div className="cid-web-link-box">
                <span className="cid-share-label">
                  {t('cid.share.webLinkLabel')}
                </span>
                <div className="cid-web-link-row">
                  <code translate="no">{webShareLink}</code>
                  <button
                    type="button"
                    className={`btn btn-primary cid-copy-link-btn ${webShareLinkCopied ? 'copied' : ''}`}
                    aria-label={t('cid.copyWebShareLink')}
                    title={t('cid.copyWebShareLink')}
                    onClick={handleCopyWebShareLink}
                  >
                    {webShareLinkCopied ? (
                      <Check size={18} />
                    ) : (
                      <Copy size={18} />
                    )}
                    <span>
                      {webShareLinkCopied
                        ? t('common.copied')
                        : t('cid.copyWebShareLink')}
                    </span>
                  </button>
                </div>
              </div>

              <div className="cid-qr-block">
                <div
                  className="cid-qr-frame"
                  aria-label={t('cid.qrLabel')}
                  role="img"
                >
                  <QRCodeCanvas
                    ref={qrCanvasRef}
                    value={webShareLink}
                    size={176}
                    marginSize={2}
                    title={t('cid.qrLabel')}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadQrCode}
                >
                  <QrCode size={16} />
                  {t('cid.downloadQrAction')}
                </button>
              </div>
            </aside>
          </div>

          <div className="cid-bottom-handoff">
            <div className="cid-handoff" aria-label={t('cid.handoff.title')}>
              <div className="cid-handoff-copy">
                <p className="cid-handoff-title">{t('cid.handoff.title')}</p>
                <p>{t('cid.handoff.desc')}</p>
              </div>
              <a
                className="btn btn-primary"
                href={mostLink}
                onClick={handleOpenMostBox}
              >
                <ExternalLink size={16} />
                {t('cid.handoff.action')}
              </a>
            </div>

            {showHandoffFallback && (
              <div className="cid-handoff-fallback" role="status">
                <AlertTriangle size={18} />
                <p>{t('cid.handoff.fallback')}</p>
                <Link to="/download/" className="btn btn-secondary">
                  <Download size={16} />
                  {t('cid.handoff.downloadAction')}
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function getCidProcessActiveIndex(
  checkStatus: CheckStatus,
  downloadStatus: DownloadStatus,
  isAddingLocalContent: boolean
) {
  if (downloadStatus === 'completed') return 3
  if (downloadStatus === 'partial') return 2
  if (downloadStatus === 'starting' || downloadStatus === 'downloading') {
    return 2
  }
  if (checkStatus === 'already-local') return 3
  if (isAddingLocalContent) return 2
  if (checkStatus === 'available') return 1
  return 0
}

function getStatusIcon(
  checkStatus: CheckStatus,
  downloadStatus: DownloadStatus
) {
  if (downloadStatus === 'completed') return <CheckCircle2 size={28} />
  if (downloadStatus === 'partial') return <AlertTriangle size={28} />
  if (downloadStatus === 'error' || checkStatus === 'error') {
    return <AlertTriangle size={28} />
  }
  if (
    checkStatus === 'checking' ||
    checkStatus === 'waiting-backend' ||
    downloadStatus === 'starting' ||
    downloadStatus === 'downloading'
  ) {
    return <Loader2 size={28} />
  }
  if (checkStatus === 'backend-missing') return <WifiOff size={28} />
  if (checkStatus === 'login-required') return <LogIn size={28} />
  return <CheckCircle2 size={28} />
}

function getStatusLabel(
  checkStatus: CheckStatus,
  t: ReturnType<typeof useI18n>['t']
) {
  switch (checkStatus) {
    case 'checking':
      return t('cid.label.checking')
    case 'available':
      return t('cid.label.available')
    case 'local-available':
      return t('cid.label.localAvailable')
    case 'already-local':
      return t('cid.label.alreadyLocal')
    case 'login-required':
      return t('cid.label.loginRequired')
    case 'backend-missing':
      return t('cid.label.backendMissing')
    case 'waiting-backend':
      return t('cid.label.waitingBackend')
    case 'error':
      return t('cid.label.error')
    default:
      return t('cid.label.idle')
  }
}
