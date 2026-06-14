import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  FileText,
  HardDrive,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  getAuthenticatedWebSocketUrl,
  getBackendUrlExport,
} from '~/server/src/utils/api'
import { useAppStore } from '~/app/app/useAppStore'
import {
  DEFAULT_LOCALE,
  useI18n,
  type Locale,
  type MessageKey,
} from '~/lib/i18n'
import { formatBytes } from '~/lib/format'

dayjs.extend(relativeTime)

interface NodeAddress {
  type: string
  ip: string
  label: string
  iface: string
}

interface NodeConfig {
  dataPath: string
  configuredDataPath?: string
  host: string
  port: number
  capacityBytes: number
  maxFileSizeBytes: number
  remoteInvites?: string[]
  remoteInviteCount?: number
  remoteInviteConfigured?: boolean
}

interface NodeLog {
  id: string
  ts: string
  level: string
  event: string
  message: string
  data?: Record<string, unknown>
}

interface NodeHolding {
  cid: string
  fileName: string
  size: number
  joined: boolean
  seedStatus?: 'queued' | 'joining' | 'active' | 'paused' | 'error'
  seedError?: string
  updatedAt?: string
  peerCount?: number
  lastServedAt?: string | null
  totalServedBytes?: number
}

interface NodeStatus {
  status: string
  version: string
  uptimeSeconds: number
  nodeId: string
  host: string
  port: number
  listen: {
    port: number
    addresses: NodeAddress[]
  }
  dataPath: string
  config: NodeConfig
  policy: {
    maxFileSizeBytes: number
  }
  capacity: {
    configuredBytes: number
    usedBytes: number
    freeBytes: number
  }
  storage: {
    total: number
    used: number
    free: number
    fileCount: number
    trashCount: number
  }
  network: {
    peers: number
    appPeers: number
    chatPeers: number
    status: string
  }
  holdings: NodeHolding[]
}

interface AdminUserData {
  address: string
  fileCount: number
  trashCount: number
  cidCount: number
}

const EMPTY_STATUS: NodeStatus | null = null

type AdminTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string

function formatUptime(seconds: number, t: AdminTranslate) {
  const total = Math.max(0, Number(seconds) || 0)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return t('admin.uptime.daysHours', { days, hours })
  if (hours > 0) return t('admin.uptime.hoursMinutes', { hours, minutes })
  return t('admin.uptime.minutes', { minutes })
}

function bytesToGiB(bytes: number) {
  if (!Number.isFinite(bytes)) return '0'
  return String(Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100)
}

function gibToBytes(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 1024 * 1024 * 1024)
}

function parseInviteText(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  )
}

function shortText(text: string, head = 12, tail = 8) {
  if (!text) return '-'
  if (text.length <= head + tail + 3) return text
  return `${text.slice(0, head)}...${text.slice(-tail)}`
}

function formatSeedStatus(holding: NodeHolding, t: AdminTranslate) {
  switch (holding.seedStatus) {
    case 'queued':
      return t('admin.seedStatus.queued')
    case 'joining':
      return t('admin.seedStatus.joining')
    case 'active':
      return t('admin.seedStatus.active')
    case 'paused':
      return t('admin.seedStatus.paused')
    case 'error':
      return holding.seedError
        ? t('admin.seedStatus.errorWithMessage', {
            message: holding.seedError,
          })
        : t('admin.seedStatus.error')
    default:
      return holding.joined
        ? t('admin.seedStatus.active')
        : t('admin.seedStatus.notJoined')
  }
}

function getDayjsLocale(locale: Locale) {
  return locale === DEFAULT_LOCALE ? 'zh-cn' : 'en'
}

function formatRecentTime(
  value: string | null | undefined,
  t: (key: MessageKey) => string,
  locale: Locale
) {
  if (!value) return t('admin.time.never')
  const time = dayjs(value)
  if (!time.isValid()) return t('admin.time.never')
  if (time.isAfter(dayjs())) return t('admin.time.justNow')
  const dayjsLocale = getDayjsLocale(locale)
  return time.locale(dayjsLocale).from(dayjs().locale(dayjsLocale))
}

const SEED_STATUS_HELP = [
  {
    labelKey: 'admin.seedHelp.active.label',
    tone: 'active',
    descKey: 'admin.seedHelp.active.desc',
  },
  {
    labelKey: 'admin.seedHelp.pending.label',
    tone: 'pending',
    descKey: 'admin.seedHelp.pending.desc',
  },
  {
    labelKey: 'admin.seedHelp.paused.label',
    tone: 'muted',
    descKey: 'admin.seedHelp.paused.desc',
  },
  {
    labelKey: 'admin.seedHelp.error.label',
    tone: 'error',
    descKey: 'admin.seedHelp.error.desc',
  },
] satisfies Array<{ labelKey: MessageKey; tone: string; descKey: MessageKey }>

const LOG_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'admin.logFilter.all' },
  { value: 'join', labelKey: 'admin.logFilter.join' },
  { value: 'pull', labelKey: 'admin.logFilter.pull' },
  { value: 'verify', labelKey: 'admin.logFilter.verify' },
  { value: 'serve', labelKey: 'admin.logFilter.serve' },
  { value: 'error', labelKey: 'admin.logFilter.error' },
] satisfies Array<{ value: string; labelKey: MessageKey }>

const LOG_FILTER_TERMS: Record<string, string[]> = {
  join: ['join', 'joined', 'topic'],
  pull: ['pull', 'p2p'],
  verify: ['verify', 'verified', 'integrity', 'download:success'],
  serve: ['seed', 'seeding', 'holding', 'publish:success', 'topic:joined'],
  error: ['error', 'failed', 'fail'],
}

function getNodeLogText(log: NodeLog) {
  let dataText = ''
  try {
    dataText = JSON.stringify(log.data || {})
  } catch {}

  return [log.level, log.event, log.message, dataText]
    .map(value => String(value || '').toLowerCase())
    .join(' ')
}

function nodeLogMatchesFilter(log: NodeLog, filter: string) {
  const normalized = String(filter || 'all')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'all') return true

  const text = getNodeLogText(log)
  if (normalized === 'error') {
    return (
      log.level === 'error' ||
      LOG_FILTER_TERMS.error.some(term => text.includes(term))
    )
  }

  const terms = LOG_FILTER_TERMS[normalized] || [normalized]
  return terms.some(term => text.includes(term))
}

export default function AdminPage() {
  const { t, locale, formatNumber, formatTime } = useI18n()
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const [status, setStatus] = useState<NodeStatus | null>(EMPTY_STATUS)
  const [logs, setLogs] = useState<NodeLog[]>([])
  const [error, setError] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false)
  const [logFilter, setLogFilter] = useState('all')
  const [users, setUsers] = useState<AdminUserData[]>([])
  const [isClearingUser, setIsClearingUser] = useState('')
  const [configForm, setConfigForm] = useState({
    dataPath: '',
    capacityGiB: '100',
    maxFileSizeGiB: '10',
    remoteInvites: '',
  })
  const isBackendReady = hasBackend === true

  function requireBackendReady() {
    if (isBackendReady) return true
    addToast(
      hasBackend === null
        ? t('admin.toast.backendChecking')
        : t('admin.toast.backendDisconnected'),
      'warning'
    )
    return false
  }

  const capacityPercent = useMemo(() => {
    if (!status || status.capacity.configuredBytes <= 0) return 0
    return Math.min(
      100,
      Math.round(
        (status.capacity.usedBytes / status.capacity.configuredBytes) * 100
      )
    )
  }, [status])

  const visibleHoldings = useMemo(
    () => (status?.holdings || []).slice(0, 100),
    [status]
  )
  const hiddenHoldingCount = Math.max(0, (status?.holdings.length || 0) - 100)
  const backendUrl = getBackendUrlExport()
  const isRemoteAdmin =
    Boolean(backendUrl) &&
    !backendUrl.includes('localhost') &&
    !backendUrl.includes('127.0.0.1')

  const loadStatus = async () => {
    if (!isBackendReady) return false
    try {
      const nextStatus = await api.get<NodeStatus>('/api/node/status').json()
      const nodeConfig = await api.get<NodeConfig>('/api/node/config').json()
      setStatus(nextStatus)
      setConfigForm({
        dataPath: nodeConfig.dataPath || nextStatus.dataPath || '',
        capacityGiB: bytesToGiB(nodeConfig.capacityBytes),
        maxFileSizeGiB: bytesToGiB(nodeConfig.maxFileSizeBytes),
        remoteInvites: (nodeConfig.remoteInvites || []).join('\n'),
      })
      setError('')
      return true
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.readStatus')
      )
      setError(message)
      addToast(message, 'error')
      return false
    }
  }

  const refreshStatus = async () => {
    if (!requireBackendReady()) return
    if (await loadStatus()) {
      addToast(t('admin.toast.statusRefreshed'), 'success')
    }
  }

  const loadLogs = async (nextFilter = logFilter) => {
    if (!isBackendReady) return
    try {
      const query = new URLSearchParams({
        limit: '80',
        filter: nextFilter,
      })
      const result = await api
        .get<{ logs: NodeLog[] }>(`/api/node/logs?${query.toString()}`)
        .json()
      setLogs(result.logs || [])
    } catch {}
  }

  const loadUsers = async () => {
    if (!isBackendReady) return
    try {
      const result = await api
        .get<{ users: AdminUserData[] }>('/api/admin/users')
        .json()
      setUsers(result.users || [])
    } catch {}
  }

  const saveConfig = async () => {
    if (!requireBackendReady()) return
    setIsSavingConfig(true)
    try {
      await api
        .post('/api/node/config', {
          json: {
            dataPath: configForm.dataPath,
            capacityBytes: gibToBytes(configForm.capacityGiB),
            maxFileSizeBytes: gibToBytes(configForm.maxFileSizeGiB),
            remoteInvites: parseInviteText(configForm.remoteInvites),
          },
        })
        .json()
      const needsRestart = configForm.dataPath !== (status?.dataPath || '')
      addToast(
        needsRestart
          ? t('admin.toast.configSavedRestart')
          : t('admin.toast.configSaved'),
        'success'
      )
      await loadStatus()
      await loadLogs()
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.saveConfig')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const copyNodeId = async () => {
    if (!status?.nodeId) return
    await navigator.clipboard.writeText(status.nodeId)
    addToast(t('admin.toast.nodeIdCopied'), 'success')
  }

  const clearLogs = async () => {
    if (!requireBackendReady()) return
    setIsClearingLogs(true)
    try {
      await api.delete('/api/node/logs').json()
      setLogs([])
      addToast(t('admin.toast.logsCleared'), 'success')
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.clearLogs')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsClearingLogs(false)
    }
  }

  const exportDiagnostics = async () => {
    if (!requireBackendReady()) return
    setIsExportingDiagnostics(true)
    try {
      const diagnostics = await api.get('/api/node/diagnostics').json()
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      link.href = url
      link.download = `mostbox-diagnostics-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      addToast(t('admin.toast.diagnosticsExported'), 'success')
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.exportDiagnostics')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsExportingDiagnostics(false)
    }
  }

  const clearUserData = async (address: string) => {
    if (!requireBackendReady()) return
    const confirmed = window.confirm(
      t('admin.confirm.clearUserData', {
        address: `${address.slice(0, 6)}...${address.slice(-4)}`,
      })
    )
    if (!confirmed) return
    setIsClearingUser(address)
    try {
      await api.delete(`/api/admin/users/${address}/data`).json()
      addToast(t('admin.toast.userDataCleared'), 'success')
      await loadUsers()
      await loadStatus()
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.clearUserData')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsClearingUser('')
    }
  }

  useEffect(() => {
    if (!isBackendReady) return
    if (isRemoteAdmin) return
    loadStatus()
    loadLogs()
    loadUsers()

    let ws: WebSocket | null = null
    let cancelled = false
    ;(async () => {
      ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (cancelled) {
        ws.close()
        return
      }
      ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if (message.event === 'node:status') {
            setStatus(message.data)
          }
          if (message.event === 'node:log') {
            if (nodeLogMatchesFilter(message.data, logFilter)) {
              setLogs(prev => [message.data, ...prev].slice(0, 80))
            }
          }
          if (message.event === 'node:logs:cleared') {
            setLogs([])
          }
          if (
            message.event === 'publish:success' ||
            message.event === 'download:success' ||
            message.event === 'network:status'
          ) {
            loadStatus()
          }
        } catch {}
      }
    })()
    return () => {
      cancelled = true
      ws?.close()
    }
  }, [isBackendReady, isRemoteAdmin, logFilter])

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div className="admin-title-group">
          <Link
            to="/"
            className="btn btn-icon"
            aria-label={t('common.backHome')}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1>{t('admin.title')}</h1>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <span
            className={`admin-status-pill ${status?.status === 'online' ? 'online' : ''}`}
          >
            <Activity size={14} />
            {status?.status === 'online'
              ? t('admin.status.online')
              : t('admin.status.waiting')}
          </span>
          <button className="btn btn-secondary" onClick={refreshStatus}>
            <RefreshCw size={16} />
            {t('admin.action.refresh')}
          </button>
        </div>
      </header>

      {hasBackend === false && (
        <section className="admin-panel admin-error">
          <Server size={20} />
          <span>{t('admin.error.localDaemonDisconnected')}</span>
        </section>
      )}

      {isRemoteAdmin && (
        <section className="admin-panel admin-error">
          <AlertTriangle size={18} />
          <div>
            <h2>{t('admin.remoteUnavailable.title')}</h2>
            <p>
              {t('admin.remoteUnavailable.desc')}
            </p>
          </div>
        </section>
      )}

      {!isRemoteAdmin && error && (
        <section className="admin-panel admin-error">
          <FileText size={20} />
          <span>{error}</span>
        </section>
      )}

      {!isRemoteAdmin && (
        <>
          <section className="admin-overview">
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <span>{t('admin.metric.nodeId')}</span>
                <strong translate="no">
                  {shortText(status?.nodeId || '')}
                </strong>
              </div>
              <button
                className="btn btn-icon admin-metric-action"
                onClick={copyNodeId}
                aria-label={t('admin.action.copyNodeId')}
              >
                <Clipboard size={15} />
              </button>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <Wifi size={18} />
              </div>
              <div>
                <span>{t('admin.metric.connections')}</span>
                <strong>
                  {status
                    ? t('admin.metric.peers', {
                        count: status.network.peers,
                      })
                    : '-'}
                </strong>
              </div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <HardDrive size={18} />
              </div>
              <div>
                <span>{t('admin.metric.capacity')}</span>
                <strong>{capacityPercent}%</strong>
              </div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <Server size={18} />
              </div>
              <div>
                <span>{t('admin.metric.uptime')}</span>
                <strong>
                  {status ? formatUptime(status.uptimeSeconds, t) : '-'}
                </strong>
              </div>
            </div>
          </section>

          <section className="admin-grid">
            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.nodeStatus.title')}</h2>
                </div>
                <CheckCircle2 size={18} />
              </div>
              <div className="admin-status-grid">
                <div>
                  <span>{t('admin.nodeStatus.version')}</span>
                  <strong translate="no">{status?.version || '-'}</strong>
                </div>
                <div>
                  <span>{t('admin.nodeStatus.listen')}</span>
                  <strong translate="no">
                    {status ? `${status.host}:${status.port}` : '-'}
                  </strong>
                </div>
                <div>
                  <span>{t('admin.nodeStatus.dataPath')}</span>
                  <strong translate="no">{status?.dataPath || '-'}</strong>
                </div>
              </div>
              <div className="admin-address-list">
                {(status?.listen.addresses || []).map(address => (
                  <span key={`${address.type}-${address.ip}`} translate="no">
                    {address.label}: {address.ip}:{status?.port}
                  </span>
                ))}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.userData.title')}</h2>
                </div>
                <Database size={18} />
              </div>
              <div className="admin-table">
                <div className="admin-table-row admin-table-head">
                  <span>{t('admin.userData.user')}</span>
                  <span>{t('admin.userData.files')}</span>
                  <span>{t('admin.userData.trash')}</span>
                  <span>{t('admin.userData.actions')}</span>
                </div>
                {users.map(user => (
                  <div className="admin-table-row" key={user.address}>
                    <span title={user.address} translate="no">
                      {shortText(user.address)}
                    </span>
                    <span>{formatNumber(user.fileCount)}</span>
                    <span>{formatNumber(user.trashCount)}</span>
                    <span>
                      <button
                        className="btn btn-ghost"
                        onClick={() => clearUserData(user.address)}
                        disabled={isClearingUser === user.address}
                      >
                        <Trash2 size={16} />
                        {t('admin.action.clear')}
                      </button>
                    </span>
                  </div>
                ))}
                {users.length === 0 && (
                  <div className="admin-empty-row">
                    {t('admin.userData.empty')}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.settings.title')}</h2>
                </div>
                <Database size={18} />
              </div>
              <div className="admin-settings-fields">
                <label className="admin-field admin-field-wide">
                  <span>{t('admin.settings.dataPath')}</span>
                  <input
                    className="input"
                    value={configForm.dataPath}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        dataPath: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>{t('admin.settings.capacityGiB')}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={configForm.capacityGiB}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        capacityGiB: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>{t('admin.settings.maxFileSizeGiB')}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={configForm.maxFileSizeGiB}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        maxFileSizeGiB: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{t('admin.settings.remoteInvites')}</span>
                  <textarea
                    className="input admin-textarea"
                    value={configForm.remoteInvites}
                    placeholder={t('admin.settings.remoteInvitesPlaceholder')}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        remoteInvites: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <p className="admin-field-hint">
                {t('admin.settings.hint')}
              </p>
              <button
                className="btn btn-primary btn-full"
                onClick={saveConfig}
                disabled={isSavingConfig}
              >
                <Save size={16} />
                {t('admin.action.saveConfig')}
              </button>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.holdings.title')}</h2>
                </div>
                <HardDrive size={18} />
              </div>
              <div className="admin-capacity-row">
                <progress value={capacityPercent} max="100" />
                <span>
                  {formatBytes(status?.capacity.usedBytes || 0)} /{' '}
                  {formatBytes(status?.capacity.configuredBytes || 0)}
                </span>
              </div>
              <div
                className="admin-seed-help"
                aria-label={t('admin.seedHelp.label')}
              >
                {SEED_STATUS_HELP.map(item => (
                  <div className="admin-seed-help-item" key={item.labelKey}>
                    <span className={`admin-seed-dot ${item.tone}`} />
                    <div>
                      <strong>{t(item.labelKey)}</strong>
                      <span>{t(item.descKey)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {hiddenHoldingCount > 0 && (
                <p className="admin-table-note">
                  {t('admin.holdings.hiddenCount', {
                    count: formatNumber(hiddenHoldingCount),
                  })}
                </p>
              )}
              <div className="admin-table">
                <div className="admin-table-row admin-table-head">
                  <span>{t('admin.holdings.file')}</span>
                  <span>CID</span>
                  <span>{t('admin.holdings.size')}</span>
                  <span>Peer</span>
                  <span>{t('admin.holdings.lastServed')}</span>
                  <span>{t('admin.holdings.status')}</span>
                </div>
                {visibleHoldings.map(holding => (
                  <div className="admin-table-row" key={holding.cid}>
                    <span translate="no">{holding.fileName || '-'}</span>
                    <span title={holding.cid} translate="no">
                      {shortText(holding.cid)}
                    </span>
                    <span>{formatBytes(holding.size)}</span>
                    <span>{holding.peerCount ?? 0}</span>
                    <span title={holding.lastServedAt || ''}>
                      {formatRecentTime(holding.lastServedAt, t, locale)}
                    </span>
                    <span
                      className={`admin-seed-pill ${
                        holding.seedStatus === 'error'
                          ? 'error'
                          : holding.seedStatus === 'active' || holding.joined
                            ? 'active'
                            : ''
                      }`}
                    >
                      {formatSeedStatus(holding, t)}
                    </span>
                  </div>
                ))}
                {(!status || status.holdings.length === 0) && (
                  <div className="admin-empty-row">
                    {t('admin.holdings.empty')}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.logs.title')}</h2>
                </div>
                <div className="admin-panel-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={exportDiagnostics}
                    disabled={isExportingDiagnostics}
                  >
                    <Download size={16} />
                    {t('admin.action.exportDiagnostics')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={clearLogs}
                    disabled={isClearingLogs || logs.length === 0}
                  >
                    <Trash2 size={16} />
                    {t('admin.action.clearLogs')}
                  </button>
                  <FileText size={18} />
                </div>
              </div>
              <div
                className="admin-log-filter"
                aria-label={t('admin.logs.filterLabel')}
              >
                {LOG_FILTER_OPTIONS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={logFilter === item.value ? 'active' : ''}
                    onClick={() => {
                      setLogFilter(item.value)
                      loadLogs(item.value)
                    }}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
              <div className="admin-log-list">
                {logs.map(log => (
                  <div className="admin-log-row" key={log.id}>
                    <time>{formatTime(log.ts)}</time>
                    <span
                      className={`admin-log-level ${log.level}`}
                      translate="no"
                    >
                      {log.level}
                    </span>
                    <strong translate="no">{log.event}</strong>
                    <span translate="no">{log.message}</span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="admin-empty-row">{t('admin.logs.empty')}</div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
