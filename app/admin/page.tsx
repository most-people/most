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

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

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

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatUptime(seconds: number) {
  const total = Math.max(0, Number(seconds) || 0)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
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

function formatSeedStatus(holding: NodeHolding) {
  switch (holding.seedStatus) {
    case 'queued':
      return '队列中'
    case 'joining':
      return '加入中'
    case 'active':
      return '做种中'
    case 'paused':
      return '已暂停'
    case 'error':
      return holding.seedError ? `错误：${holding.seedError}` : '错误'
    default:
      return holding.joined ? '做种中' : '未 join'
  }
}

function formatRecentTime(value?: string | null) {
  if (!value) return '从未'
  const time = dayjs(value)
  if (!time.isValid()) return '从未'
  if (time.isAfter(dayjs())) return '刚刚'
  return time.fromNow()
}

const SEED_STATUS_HELP = [
  {
    label: '做种中',
    tone: 'active',
    desc: '已加入 CID topic，可被其他节点发现并提供完整副本。',
  },
  {
    label: '队列中 / 加入中',
    tone: 'pending',
    desc: '正在等待或重连 topic，通常会自动进入做种中。',
  },
  {
    label: '已暂停 / 未 join',
    tone: 'muted',
    desc: '本机仍持有文件，但当前不会对外提供下载。',
  },
  {
    label: '错误',
    tone: 'error',
    desc: '加入或做种失败，请查看下方节点日志里的 seed 事件。',
  },
]

const LOG_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'join', label: 'Join' },
  { value: 'pull', label: 'Pull' },
  { value: 'verify', label: 'Verify' },
  { value: 'serve', label: 'Serve' },
  { value: 'error', label: 'Error' },
]

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
      hasBackend === null ? '正在检测后端连接，请稍后再试' : '未连接后端',
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
      const message = await getApiErrorMessage(err, '无法读取节点状态')
      setError(message)
      addToast(message, 'error')
      return false
    }
  }

  const refreshStatus = async () => {
    if (!requireBackendReady()) return
    if (await loadStatus()) {
      addToast('节点状态已刷新', 'success')
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
          ? '节点配置已保存。修改了数据目录，需要重启 daemon 生效。'
          : '节点配置已保存',
        'success'
      )
      await loadStatus()
      await loadLogs()
    } catch (err) {
      const message = await getApiErrorMessage(err, '保存配置失败')
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const copyNodeId = async () => {
    if (!status?.nodeId) return
    await navigator.clipboard.writeText(status.nodeId)
    addToast('节点 ID 已复制', 'success')
  }

  const clearLogs = async () => {
    if (!requireBackendReady()) return
    setIsClearingLogs(true)
    try {
      await api.delete('/api/node/logs').json()
      setLogs([])
      addToast('节点日志已清空', 'success')
    } catch (err) {
      const message = await getApiErrorMessage(err, '清空日志失败')
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
      addToast('诊断已导出', 'success')
    } catch (err) {
      const message = await getApiErrorMessage(err, '导出诊断失败')
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsExportingDiagnostics(false)
    }
  }

  const clearUserData = async (address: string) => {
    if (!requireBackendReady()) return
    const confirmed = window.confirm(
      `确定清除用户 ${address.slice(0, 6)}...${address.slice(-4)} 的文件记录和回收站吗？无人引用的副本也会被清理。`
    )
    if (!confirmed) return
    setIsClearingUser(address)
    try {
      await api.delete(`/api/admin/users/${address}/data`).json()
      addToast('用户数据已清除', 'success')
      await loadUsers()
      await loadStatus()
    } catch (err) {
      const message = await getApiErrorMessage(err, '清除用户数据失败')
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
          <Link to="/" className="btn btn-icon" aria-label="返回首页">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1>节点管理</h1>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <span
            className={`admin-status-pill ${status?.status === 'online' ? 'online' : ''}`}
          >
            <Activity size={14} />
            {status?.status === 'online' ? '在线' : '等待'}
          </span>
          <button className="btn btn-secondary" onClick={refreshStatus}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </header>

      {hasBackend === false && (
        <section className="admin-panel admin-error">
          <Server size={20} />
          <span>未连接本地 daemon</span>
        </section>
      )}

      {isRemoteAdmin && (
        <section className="admin-panel admin-error">
          <AlertTriangle size={18} />
          <div>
            <h2>远程节点管理不可用</h2>
            <p>
              当前连接的是别人部署的远程节点，普通邀请码不能查看或修改节点管理数据。
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
                <span>节点 ID</span>
                <strong>{shortText(status?.nodeId || '')}</strong>
              </div>
              <button
                className="btn btn-icon admin-metric-action"
                onClick={copyNodeId}
                aria-label="复制节点 ID"
              >
                <Clipboard size={15} />
              </button>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <Wifi size={18} />
              </div>
              <div>
                <span>连接</span>
                <strong>
                  {status ? `${status.network.peers} peers` : '-'}
                </strong>
              </div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <HardDrive size={18} />
              </div>
              <div>
                <span>容量</span>
                <strong>{capacityPercent}%</strong>
              </div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <Server size={18} />
              </div>
              <div>
                <span>运行</span>
                <strong>
                  {status ? formatUptime(status.uptimeSeconds) : '-'}
                </strong>
              </div>
            </div>
          </section>

          <section className="admin-grid">
            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>节点状态</h2>
                </div>
                <CheckCircle2 size={18} />
              </div>
              <div className="admin-status-grid">
                <div>
                  <span>版本</span>
                  <strong>{status?.version || '-'}</strong>
                </div>
                <div>
                  <span>监听</span>
                  <strong>
                    {status ? `${status.host}:${status.port}` : '-'}
                  </strong>
                </div>
                <div>
                  <span>数据目录</span>
                  <strong>{status?.dataPath || '-'}</strong>
                </div>
              </div>
              <div className="admin-address-list">
                {(status?.listen.addresses || []).map(address => (
                  <span key={`${address.type}-${address.ip}`}>
                    {address.label}: {address.ip}:{status?.port}
                  </span>
                ))}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>用户数据</h2>
                </div>
                <Database size={18} />
              </div>
              <div className="admin-table">
                <div className="admin-table-row admin-table-head">
                  <span>用户</span>
                  <span>文件</span>
                  <span>回收站</span>
                  <span>操作</span>
                </div>
                {users.map(user => (
                  <div className="admin-table-row" key={user.address}>
                    <span title={user.address}>{shortText(user.address)}</span>
                    <span>{user.fileCount}</span>
                    <span>{user.trashCount}</span>
                    <span>
                      <button
                        className="btn btn-ghost"
                        onClick={() => clearUserData(user.address)}
                        disabled={isClearingUser === user.address}
                      >
                        <Trash2 size={16} />
                        清除
                      </button>
                    </span>
                  </div>
                ))}
                {users.length === 0 && (
                  <div className="admin-empty-row">暂无用户数据</div>
                )}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>节点设置</h2>
                </div>
                <Database size={18} />
              </div>
              <div className="admin-settings-fields">
                <label className="admin-field admin-field-wide">
                  <span>数据目录</span>
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
                  <span>容量上限 GiB</span>
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
                  <span>单文件最大 GiB</span>
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
                  <span>远程访问邀请码</span>
                  <textarea
                    className="input admin-textarea"
                    value={configForm.remoteInvites}
                    placeholder="每行一个，或用英文逗号分隔"
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
                数据目录变更保存后需要重启 daemon。修改邀请码后新请求立即生效。
                发布和下载成功后会固定做种；MostBox 不设同时做种数或传输限速。
              </p>
              <button
                className="btn btn-primary btn-full"
                onClick={saveConfig}
                disabled={isSavingConfig}
              >
                <Save size={16} />
                保存配置
              </button>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>持有副本</h2>
                </div>
                <HardDrive size={18} />
              </div>
              <div className="admin-capacity-row">
                <progress value={capacityPercent} max="100" />
                <span>
                  {formatSize(status?.capacity.usedBytes || 0)} /{' '}
                  {formatSize(status?.capacity.configuredBytes || 0)}
                </span>
              </div>
              <div className="admin-seed-help" aria-label="做种状态说明">
                {SEED_STATUS_HELP.map(item => (
                  <div className="admin-seed-help-item" key={item.label}>
                    <span className={`admin-seed-dot ${item.tone}`} />
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              {hiddenHoldingCount > 0 && (
                <p className="admin-table-note">
                  当前仅展示前 100 个副本，另有 {hiddenHoldingCount}{' '}
                  个仍在后台做种。
                </p>
              )}
              <div className="admin-table">
                <div className="admin-table-row admin-table-head">
                  <span>文件</span>
                  <span>CID</span>
                  <span>大小</span>
                  <span>Peer</span>
                  <span>最近服务</span>
                  <span>状态</span>
                </div>
                {visibleHoldings.map(holding => (
                  <div className="admin-table-row" key={holding.cid}>
                    <span translate="no">{holding.fileName || '-'}</span>
                    <span title={holding.cid} translate="no">
                      {shortText(holding.cid)}
                    </span>
                    <span>{formatSize(holding.size)}</span>
                    <span>{holding.peerCount ?? 0}</span>
                    <span title={holding.lastServedAt || ''}>
                      {formatRecentTime(holding.lastServedAt)}
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
                      {formatSeedStatus(holding)}
                    </span>
                  </div>
                ))}
                {(!status || status.holdings.length === 0) && (
                  <div className="admin-empty-row">暂无持有副本</div>
                )}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>节点日志</h2>
                </div>
                <div className="admin-panel-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={exportDiagnostics}
                    disabled={isExportingDiagnostics}
                  >
                    <Download size={16} />
                    导出诊断
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={clearLogs}
                    disabled={isClearingLogs || logs.length === 0}
                  >
                    <Trash2 size={16} />
                    清空日志
                  </button>
                  <FileText size={18} />
                </div>
              </div>
              <div className="admin-log-filter" aria-label="日志筛选">
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
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="admin-log-list">
                {logs.map(log => (
                  <div className="admin-log-row" key={log.id}>
                    <time>{new Date(log.ts).toLocaleTimeString('zh-CN')}</time>
                    <span className={`admin-log-level ${log.level}`}>
                      {log.level}
                    </span>
                    <strong>{log.event}</strong>
                    <span>{log.message}</span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="admin-empty-row">暂无日志</div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
