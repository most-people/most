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
  fileApi,
  getDownloadCheckErrorMessage,
  type DownloadCheckResponse,
} from '~/lib/fileApi'
import { formatBytes } from '~/lib/format'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import { MarketingHeader } from '~/components/MarketingHeader'
import { useClipboard } from '~/hooks'
import { useI18n } from '~/lib/i18n'
import { buildCidShareLink } from '~/lib/shareLink'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import {
  getApiErrorMessage,
  getApiErrorPayload,
  getAuthenticatedWebSocketUrl,
} from '~server/src/utils/api'
import { parseMostLink } from '~server/src/core/mostLink.js'

type CheckStatus =
  | 'idle'
  | 'waiting-backend'
  | 'login-required'
  | 'backend-missing'
  | 'checking'
  | 'available'
  | 'already-local'
  | 'error'

type DownloadStatus =
  | 'idle'
  | 'starting'
  | 'downloading'
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

type DownloadEventPayload = {
  taskId?: string
  status?: string
  kind?: string
  code?: string
  errorCode?: string
  collection?: boolean
  partial?: boolean
  percent?: number
  loaded?: number
  total?: number
  fileCount?: number
  selectedFileCount?: number
  downloadedFileCount?: number
  unavailableFileCount?: number
  processedFiles?: number
  completedFiles?: number
  totalFiles?: number
  file?: string
  fileName?: string
  error?: string
  details?: DownloadErrorDetails
}

type DownloadErrorDetails = {
  kind?: string
  collectionName?: string
  childCid?: string
  childPath?: string
  fileName?: string
}

type CollectionProgress = {
  completedFiles: number
  totalFiles: number
}

type CidProcessStepKey = 'open' | 'check' | 'verify' | 'seed'

const HANDOFF_FALLBACK_DELAY_MS = 1800

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
  const separator = cleaned.includes('\\') ? '\\' : '/'
  return `${cleaned}${separator}downloads`
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function readDownloadErrorDetails(
  value: unknown
): DownloadErrorDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const record = value as Record<string, unknown>
  return {
    kind: readString(record, 'kind'),
    collectionName: readString(record, 'collectionName'),
    childCid: readString(record, 'childCid'),
    childPath: readString(record, 'childPath'),
    fileName: readString(record, 'fileName'),
  }
}

function normalizeDownloadErrorPayload(value: unknown): DownloadEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const record = value as Record<string, unknown>
  return {
    code: readString(record, 'code'),
    errorCode: readString(record, 'errorCode'),
    error: readString(record, 'error'),
    details: readDownloadErrorDetails(record.details),
  }
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

function parseDownloadEvent(raw: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const root = parsed as Record<string, unknown>
  const event = readString(root, 'event')
  const data = root.data
  if (!event || !data || typeof data !== 'object') return null

  const payloadRecord = data as Record<string, unknown>
  const payload: DownloadEventPayload = {
    taskId: readString(payloadRecord, 'taskId'),
    status: readString(payloadRecord, 'status'),
    kind: readString(payloadRecord, 'kind'),
    code: readString(payloadRecord, 'code'),
    errorCode: readString(payloadRecord, 'errorCode'),
    collection: readBoolean(payloadRecord, 'collection'),
    partial: readBoolean(payloadRecord, 'partial'),
    percent: readNumber(payloadRecord, 'percent'),
    loaded: readNumber(payloadRecord, 'loaded'),
    total: readNumber(payloadRecord, 'total'),
    fileCount: readNumber(payloadRecord, 'fileCount'),
    selectedFileCount: readNumber(payloadRecord, 'selectedFileCount'),
    downloadedFileCount: readNumber(payloadRecord, 'downloadedFileCount'),
    unavailableFileCount: readNumber(payloadRecord, 'unavailableFileCount'),
    processedFiles: readNumber(payloadRecord, 'processedFiles'),
    completedFiles: readNumber(payloadRecord, 'completedFiles'),
    totalFiles: readNumber(payloadRecord, 'totalFiles'),
    file: readString(payloadRecord, 'file'),
    fileName: readString(payloadRecord, 'fileName'),
    error: readString(payloadRecord, 'error'),
    details: readDownloadErrorDetails(payloadRecord.details),
  }

  return { event, payload }
}

export default function CidPage() {
  const { t } = useI18n()
  const { cid } = useParams({ from: '/cid/$cid/' })
  const searchStr = useLocation({ select: location => location.searchStr })
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const openConnectModal = useAppStore(s => s.openConnectModal)
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
  const [checkResult, setCheckResult] = useState<DownloadCheckResponse | null>(
    null
  )
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: 'idle',
    message: '',
  })
  const [taskId, setTaskId] = useState('')
  const [progress, setProgress] = useState(0)
  const [loadedBytes, setLoadedBytes] = useState<number | null>(null)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [collectionProgress, setCollectionProgress] =
    useState<CollectionProgress | null>(null)
  const [downloadPath, setDownloadPath] = useState('')
  const [showHandoffFallback, setShowHandoffFallback] = useState(false)
  const checkSeqRef = useRef(0)
  const handoffTimerRef = useRef<number | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const fileName = checkResult?.fileName || initialFileName
  const fileSize = checkResult?.size ?? totalBytes
  const isCollectionResult = checkResult?.kind === 'collection'
  const collectionFileCount =
    checkResult?.fileCount ?? checkResult?.files?.length ?? 0
  const collectionLocalCount = checkResult?.localAvailableCount ?? 0
  const collectionMissingCount =
    checkResult?.missingLocalCount ??
    Math.max(collectionFileCount - collectionLocalCount, 0)
  const canStartDownload =
    checkState.status === 'available' || checkState.status === 'already-local'
  const isDownloading =
    downloadState.status === 'starting' ||
    downloadState.status === 'downloading'

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
      title: t('cid.process.step.verify.title'),
      desc: t('cid.process.step.verify.desc'),
    },
    {
      key: 'seed',
      title: t('cid.process.step.seed.title'),
      desc: t('cid.process.step.seed.desc'),
    },
  ]
  const cidProcessActiveIndex = getCidProcessActiveIndex(
    checkState.status,
    downloadState.status
  )

  const runCheck = useCallback(async () => {
    const seq = checkSeqRef.current + 1
    checkSeqRef.current = seq
    setTaskId('')
    setProgress(0)
    setLoadedBytes(null)
    setTotalBytes(null)
    setDownloadState({ status: 'idle', message: '' })

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

    setCheckState({ status: 'checking', message: t('cid.status.checking') })
    setCheckResult(null)

    try {
      const result = await fileApi.checkDownload(mostLink)
      if (checkSeqRef.current !== seq) return
      setCheckResult(result)
      const isCollection = result.kind === 'collection'
      setCheckState({
        status: result.alreadyExists ? 'already-local' : 'available',
        message: isCollection
          ? result.alreadyExists
            ? t('cid.status.collectionAlreadyLocal', {
                fileName: result.fileName,
              })
            : t('cid.status.collectionAvailable', {
                fileName: result.fileName,
              })
          : result.alreadyExists
            ? t('cid.status.alreadyLocal', { fileName: result.fileName })
            : t('cid.status.available', { fileName: result.fileName }),
      })
    } catch (err) {
      if (checkSeqRef.current !== seq) return
      const message = await getDownloadCheckErrorMessage(err)
      setCheckState({ status: 'error', message })
      setCheckResult(null)
    }
  }, [hasBackend, mostLink, t, userIdentity, validationMessage])

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
    runCheck()
  }, [runCheck])

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
    if (!taskId || !userIdentity) return

    let ws: WebSocket | null = null
    let cancelled = false
    ;(async () => {
      ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (cancelled) {
        ws.close()
        return
      }

      ws.onmessage = event => {
        const parsed = parseDownloadEvent(event.data)
        if (!parsed || parsed.payload.taskId !== taskId) return

        if (parsed.event === 'download:progress') {
          setProgress(parsed.payload.percent || 0)
          if (parsed.payload.collection === true) {
            setLoadedBytes(null)
            setTotalBytes(null)
            setCollectionProgress({
              completedFiles:
                parsed.payload.completedFiles ?? parsed.payload.loaded ?? 0,
              totalFiles:
                parsed.payload.totalFiles ?? parsed.payload.total ?? 0,
            })
          } else {
            setCollectionProgress(null)
            setLoadedBytes(parsed.payload.loaded ?? null)
            setTotalBytes(parsed.payload.total ?? null)
          }
        }

        if (parsed.event === 'download:status') {
          setDownloadState({
            status: 'downloading',
            message: parsed.payload.file
              ? t('cid.status.downloadingFile', {
                  fileName: parsed.payload.file,
                })
              : t('cid.status.downloading'),
          })
        }

        if (parsed.event === 'download:success') {
          const successCopy = getDownloadSuccessCopy(
            parsed.payload,
            fileName,
            t
          )
          setProgress(100)
          setDownloadState({
            status: 'completed',
            message: successCopy.message,
          })
          addToast(successCopy.toast, successCopy.toastType)
        }

        if (parsed.event === 'download:error') {
          const errorCopy = getDownloadErrorCopy(
            parsed.payload,
            t('cid.status.downloadFailed', { error: t('cid.errorFallback') }),
            t
          )
          setDownloadState({
            status: 'error',
            message: errorCopy.message,
          })
          addToast(errorCopy.toast, 'error')
        }

        if (parsed.event === 'download:cancelled') {
          setDownloadState({
            status: 'cancelled',
            message: t('cid.status.cancelled'),
          })
          addToast(t('cid.toast.cancelled'), 'warning')
        }
      }
    })()

    return () => {
      cancelled = true
      ws?.close()
    }
  }, [addToast, fileName, t, taskId, userIdentity])

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

    setDownloadState({
      status: 'starting',
      message: t('cid.status.startingDownload'),
    })
    setProgress(0)
    setLoadedBytes(null)
    setTotalBytes(null)
    setCollectionProgress(null)

    try {
      const result = await fileApi.downloadFile(mostLink)
      if (result.alreadyExists) {
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
        setTaskId(result.taskId)
        setDownloadState({
          status: 'downloading',
          message: t('cid.status.downloading'),
        })
        addToast(t('cid.toast.downloadStarted'), 'info')
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
    await fileApi.cancelDownload(taskId).catch(() => {})
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
            onClick={runCheck}
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
              ) : (
                <Download size={16} />
              )}
              <span>
                {isDownloading
                  ? t('cid.downloadingAction')
                  : t('cid.startAction')}
              </span>
            </button>
            {taskId && downloadState.status === 'downloading' && (
              <button
                className="btn btn-secondary"
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
            <div className="cid-panel cid-main-panel">
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
                <span className={`cid-status-icon ${checkState.status}`}>
                  {statusIcon}
                </span>
                <div>
                  <p className="cid-status-label">
                    {getStatusLabel(checkState.status, t)}
                  </p>
                  <p className="cid-status-message">{checkState.message}</p>
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
                    {t('cid.collectionSummary', {
                      fileCount: collectionFileCount,
                      localAvailableCount: collectionLocalCount,
                      missingLocalCount: collectionMissingCount,
                    })}
                  </p>
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
              className="cid-share-panel"
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
  downloadStatus: DownloadStatus
) {
  if (downloadStatus === 'completed') return 3
  if (downloadStatus === 'starting' || downloadStatus === 'downloading') {
    return 2
  }
  if (checkStatus === 'available' || checkStatus === 'already-local') return 1
  return 0
}

function getStatusIcon(
  checkStatus: CheckStatus,
  downloadStatus: DownloadStatus
) {
  if (downloadStatus === 'completed') return <CheckCircle2 size={28} />
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
