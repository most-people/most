'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Database,
  FileText,
  HardDrive,
  ListChecks,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react'
import { api, getWebSocketUrl } from '~/server/src/utils/api'
import { useAppStore } from '~/app/app/useAppStore'

interface NodeAddress {
  type: string
  ip: string
  label: string
  iface: string
}

interface NodeConfig {
  dataPath: string
  configuredDataPath?: string
  capacityBytes: number
  autoSeedDownloads: boolean
  autoSeedPublishes: boolean
  maxConcurrentSeeds: number
  uploadRateLimitBytesPerSecond: number
  maxFileSizeBytes: number
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
  chunkMerkleRoot?: string
  root?: string
  joined: boolean
  updatedAt?: string
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
    autoSeedDownloads: boolean
    autoSeedPublishes: boolean
    maxFileSizeBytes: number
    maxConcurrentSeeds: number
    uploadRateLimitBytesPerSecond: number
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

function bytesPerSecondToMbps(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0'
  return String(Math.round((bytes / 1024 / 1024) * 100) / 100)
}

function mbpsToBytesPerSecond(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.round(parsed * 1024 * 1024)
}

function numberOrZero(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function shortText(text: string, head = 12, tail = 8) {
  if (!text) return '-'
  if (text.length <= head + tail + 3) return text
  return `${text.slice(0, head)}...${text.slice(-tail)}`
}

export default function AdminPage() {
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const [status, setStatus] = useState<NodeStatus | null>(EMPTY_STATUS)
  const [logs, setLogs] = useState<NodeLog[]>([])
  const [error, setError] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSavingPolicy, setIsSavingPolicy] = useState(false)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [configForm, setConfigForm] = useState({
    dataPath: '',
    capacityGiB: '100',
  })
  const [policyForm, setPolicyForm] = useState({
    autoSeedDownloads: true,
    autoSeedPublishes: true,
    maxFileSizeGiB: '100',
    maxConcurrentSeeds: '32',
    uploadRateLimitMbps: '0',
  })

  const capacityPercent = useMemo(() => {
    if (!status || status.capacity.configuredBytes <= 0) return 0
    return Math.min(
      100,
      Math.round(
        (status.capacity.usedBytes / status.capacity.configuredBytes) * 100
      )
    )
  }, [status])

  const loadStatus = async () => {
    try {
      const nextStatus = await api.get<NodeStatus>('/api/node/status').json()
      setStatus(nextStatus)
      setConfigForm({
        dataPath: nextStatus.dataPath || '',
        capacityGiB: bytesToGiB(nextStatus.config.capacityBytes),
      })
      setPolicyForm({
        autoSeedDownloads: nextStatus.policy.autoSeedDownloads,
        autoSeedPublishes: nextStatus.policy.autoSeedPublishes,
        maxFileSizeGiB: bytesToGiB(nextStatus.policy.maxFileSizeBytes),
        maxConcurrentSeeds: String(nextStatus.policy.maxConcurrentSeeds),
        uploadRateLimitMbps: bytesPerSecondToMbps(
          nextStatus.policy.uploadRateLimitBytesPerSecond
        ),
      })
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法读取节点状态')
    }
  }

  const loadLogs = async () => {
    try {
      const result = await api
        .get<{ logs: NodeLog[] }>('/api/node/logs?limit=80')
        .json()
      setLogs(result.logs || [])
    } catch {}
  }

  const saveConfig = async () => {
    setIsSavingConfig(true)
    try {
      await api
        .post('/api/node/config', {
          json: {
            dataPath: configForm.dataPath,
            capacityBytes: gibToBytes(configForm.capacityGiB),
          },
        })
        .json()
      addToast('节点配置已保存', 'success')
      await loadStatus()
      await loadLogs()
    } catch (err) {
      addToast('保存配置失败', 'error')
      setError(err instanceof Error ? err.message : '保存配置失败')
    } finally {
      setIsSavingConfig(false)
    }
  }

  const savePolicy = async () => {
    setIsSavingPolicy(true)
    try {
      await api
        .post('/api/node/policy', {
          json: {
            autoSeedDownloads: policyForm.autoSeedDownloads,
            autoSeedPublishes: policyForm.autoSeedPublishes,
            maxFileSizeBytes: gibToBytes(policyForm.maxFileSizeGiB),
            maxConcurrentSeeds: numberOrZero(policyForm.maxConcurrentSeeds),
            uploadRateLimitBytesPerSecond: mbpsToBytesPerSecond(
              policyForm.uploadRateLimitMbps
            ),
          },
        })
        .json()
      addToast('节点策略已保存', 'success')
      await loadStatus()
      await loadLogs()
    } catch (err) {
      addToast('保存策略失败', 'error')
      setError(err instanceof Error ? err.message : '保存策略失败')
    } finally {
      setIsSavingPolicy(false)
    }
  }

  const copyNodeId = async () => {
    if (!status?.nodeId) return
    await navigator.clipboard.writeText(status.nodeId)
    addToast('节点 ID 已复制', 'success')
  }

  const clearLogs = async () => {
    setIsClearingLogs(true)
    try {
      await api.delete('/api/node/logs').json()
      setLogs([])
      addToast('节点日志已清空', 'success')
    } catch (err) {
      addToast('清空日志失败', 'error')
      setError(err instanceof Error ? err.message : '清空日志失败')
    } finally {
      setIsClearingLogs(false)
    }
  }

  useEffect(() => {
    if (hasBackend !== true) return
    loadStatus()
    loadLogs()

    const ws = new WebSocket(getWebSocketUrl('/ws'))
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.event === 'node:status') {
          setStatus(message.data)
        }
        if (message.event === 'node:log') {
          setLogs(prev => [message.data, ...prev].slice(0, 80))
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
    return () => ws.close()
  }, [hasBackend])

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div className="admin-title-group">
          <Link
            href="/app"
            className="btn btn-icon"
            aria-label="返回文件控制台"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <p className="admin-kicker">MostBox daemon</p>
            <h1>节点管理台</h1>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <span
            className={`admin-status-pill ${status?.status === 'online' ? 'online' : ''}`}
          >
            <Activity size={14} />
            {status?.status === 'online' ? '在线' : '等待'}
          </span>
          <button className="btn btn-secondary" onClick={loadStatus}>
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

      {error && (
        <section className="admin-panel admin-error">
          <FileText size={20} />
          <span>{error}</span>
        </section>
      )}

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
            <strong>{status ? `${status.network.peers} peers` : '-'}</strong>
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
            <strong>{status ? formatUptime(status.uptimeSeconds) : '-'}</strong>
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <div className="admin-panel admin-span-2">
          <div className="admin-panel-header">
            <div>
              <p className="admin-kicker">Status</p>
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
              <strong>{status ? `${status.host}:${status.port}` : '-'}</strong>
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

        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p className="admin-kicker">Capacity</p>
              <h2>容量配置</h2>
            </div>
            <Database size={18} />
          </div>
          <label className="admin-field">
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
          <button
            className="btn btn-primary btn-full"
            onClick={saveConfig}
            disabled={isSavingConfig}
          >
            <Save size={16} />
            保存配置
          </button>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p className="admin-kicker">Policy</p>
              <h2>做种策略</h2>
            </div>
            <ListChecks size={18} />
          </div>
          <label className="admin-toggle-row">
            <span>下载后自动做种</span>
            <input
              type="checkbox"
              checked={policyForm.autoSeedDownloads}
              onChange={event =>
                setPolicyForm(prev => ({
                  ...prev,
                  autoSeedDownloads: event.target.checked,
                }))
              }
            />
          </label>
          <label className="admin-toggle-row">
            <span>发布后自动做种</span>
            <input
              type="checkbox"
              checked={policyForm.autoSeedPublishes}
              onChange={event =>
                setPolicyForm(prev => ({
                  ...prev,
                  autoSeedPublishes: event.target.checked,
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
              value={policyForm.maxFileSizeGiB}
              onChange={event =>
                setPolicyForm(prev => ({
                  ...prev,
                  maxFileSizeGiB: event.target.value,
                }))
              }
            />
          </label>
          <label className="admin-field">
            <span>最大同时做种数</span>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={policyForm.maxConcurrentSeeds}
              onChange={event =>
                setPolicyForm(prev => ({
                  ...prev,
                  maxConcurrentSeeds: event.target.value,
                }))
              }
            />
          </label>
          <label className="admin-field">
            <span>上传限速 MB/s</span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={policyForm.uploadRateLimitMbps}
              onChange={event =>
                setPolicyForm(prev => ({
                  ...prev,
                  uploadRateLimitMbps: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="btn btn-primary btn-full"
            onClick={savePolicy}
            disabled={isSavingPolicy}
          >
            <Save size={16} />
            保存策略
          </button>
        </div>

        <div className="admin-panel admin-span-2">
          <div className="admin-panel-header">
            <div>
              <p className="admin-kicker">Storage</p>
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
          <div className="admin-table">
            <div className="admin-table-row admin-table-head">
              <span>文件</span>
              <span>CID</span>
              <span>Merkle</span>
              <span>状态</span>
            </div>
            {(status?.holdings || []).map(holding => (
              <div className="admin-table-row" key={holding.cid}>
                <span>{holding.fileName || '-'}</span>
                <span>{shortText(holding.cid)}</span>
                <span>
                  {shortText(holding.chunkMerkleRoot || holding.root || '')}
                </span>
                <span>{holding.joined ? '已 join' : '未 join'}</span>
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
              <p className="admin-kicker">Logs</p>
              <h2>节点日志</h2>
            </div>
            <div className="admin-panel-actions">
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
    </main>
  )
}
