'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Copy, Globe, ChevronDown, Power, Link } from 'lucide-react'
import { api } from '../src/utils/api'
import { useClipboard } from '../hooks'
import {
  setBackendUrl,
  getBackendUrlExport,
  checkBackendConnection,
  detectSameOriginBackend,
  detectLocalhostBackend,
} from '../src/utils/api'

function SettingsDrawer({ onClose, addToast, isDarkMode, handleShutdown }) {
  const { copy } = useClipboard()
  const [dataPath, setStoragePath] = useState('')
  const [originalPath, setOriginalPath] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [networkAddresses, setNetworkAddresses] = useState([])
  const [networkPort, setNetworkPort] = useState(1976)
  const [showGuide, setShowGuide] = useState(false)
  const [backendUrl, setBackendUrlState] = useState('')
  const [backendInput, setBackendInput] = useState('')
  const [backendConnecting, setBackendConnecting] = useState(false)
  const [backendStatus, setBackendStatus] = useState('')
  const drawerRef = useRef(null)

  useEffect(() => {
    const saved = getBackendUrlExport()
    setBackendUrlState(saved)
    setBackendInput(saved)

    api
      .get('/api/data-path')
      .json<{ dataPath?: string; isDefault?: boolean }>()
      .then(config => {
        const path = config.dataPath || ''
        setStoragePath(path)
        setOriginalPath(path)
        setIsDefault(config.isDefault || false)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    api
      .get('/api/network')
      .json<{
        addresses?: { type: string; ip: string; label: string }[]
        port?: number
      }>()
      .then(data => {
        setNetworkAddresses(data.addresses || [])
        setNetworkPort(data.port || 1976)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!backendUrl) {
      detectSameOriginBackend().then(detected => {
        if (detected) {
          setBackendStatus('检测到同域名后端')
          return
        }
        detectLocalhostBackend().then(localDetected => {
          if (localDetected) {
            setBackendInput('http://localhost:1976')
            setBackendStatus('检测到本地后端 localhost:1976')
          }
        })
      })
    }
  }, [backendUrl])

  const handleSavePath = async () => {
    if (!dataPath.trim()) return
    if (dataPath.trim() === originalPath) return
    setSaving(true)
    try {
      await api.post('/api/config', { json: { dataPath: dataPath.trim() } })
      await api.post('/api/shutdown')
      window.close()
    } catch (err) {
      addToast(err.message || '保存失败', 'error')
      setSaving(false)
    }
  }

  const handleResetPath = async () => {
    if (originalPath === '') return
    setSaving(true)
    try {
      await api.post('/api/config', { json: { resetStorage: true } })
      await api.post('/api/shutdown')
      window.close()
    } catch (err) {
      addToast(err.message || '操作失败', 'error')
      setSaving(false)
    }
  }

  const handleSaveBackend = async e => {
    e.preventDefault()
    const url = backendInput.trim()
    setBackendConnecting(true)
    setBackendStatus('连接中...')
    setBackendUrl(url)
    const ok = await checkBackendConnection()
    setBackendConnecting(false)
    if (ok) {
      setBackendStatus('连接成功，刷新中...')
      setTimeout(() => window.location.reload(), 500)
    } else {
      setBackendStatus('连接失败，请检查地址是否正确')
    }
  }

  const isPathChanged = dataPath.trim() !== originalPath

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div
        className="settings-drawer"
        ref={drawerRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="drawer-header">
          <h2 className="drawer-title">设置</h2>
          <button onClick={onClose} className="drawer-close-btn">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-content">
          <div className="drawer-section">
            <label className="drawer-label">后端地址</label>
            <form onSubmit={handleSaveBackend} className="drawer-row">
              <input
                type="text"
                value={backendInput}
                onChange={e => setBackendInput(e.target.value)}
                placeholder="留空使用同域名后端"
                className="drawer-input"
              />
              <button
                type="submit"
                disabled={backendConnecting}
                className="btn primary btn-nowrap"
              >
                {backendConnecting ? '连接中...' : '保存'}
              </button>
            </form>
            {backendStatus && (
              <p
                className={`drawer-status ${backendStatus.includes('成功') ? 'status-success' : backendStatus.includes('失败') ? 'status-error' : ''}`}
              >
                {backendStatus}
              </p>
            )}
          </div>

          <div className="drawer-divider" />

          <div className="drawer-section">
            <label className="drawer-label">存储位置</label>
            <div className="drawer-row">
              <input
                type="text"
                value={dataPath}
                onChange={e => setStoragePath(e.target.value)}
                placeholder="如 D:\"
                disabled={loading}
                className="drawer-input"
              />
              <button
                onClick={handleSavePath}
                disabled={saving || loading || !isPathChanged}
                className="btn primary btn-nowrap"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              {!isDefault && (
                <button
                  onClick={handleResetPath}
                  disabled={saving || loading}
                  className="btn secondary btn-nowrap"
                >
                  恢复默认
                </button>
              )}
            </div>
            <p className="drawer-hint">修改后需重启应用</p>
          </div>

          <div className="drawer-divider" />

          <div className="drawer-section">
            <label className="drawer-label">
              <Globe size={14} className="icon-inline" />
              远程访问
            </label>
            <div className="network-addresses">
              {networkAddresses.map((addr, i) => (
                <div key={i} className="address-item">
                  <span className={`address-type address-type-${addr.type}`}>
                    {addr.label}
                  </span>
                  <code className="address-url">
                    {addr.type === 'local' ? 'http' : 'http'}://{addr.ip}:
                    {networkPort}
                  </code>
                  <button
                    className="copy-btn"
                    onClick={() => {
                      copy(`http://${addr.ip}:${networkPort}`)
                      addToast('已复制', 'success')
                    }}
                  >
                    <Copy size={13} />
                  </button>
                </div>
              ))}
            </div>
            <p className="drawer-hint">同一网络下可直接访问局域网地址</p>

            <button
              className="guide-toggle"
              onClick={() => setShowGuide(!showGuide)}
            >
              <span>如何从外网访问？</span>
              <ChevronDown
                size={14}
                className={`guide-toggle-icon ${showGuide ? 'rotated' : ''}`}
              />
            </button>
            {showGuide && (
              <div className="guide-content">
                <div className="guide-item">
                  <strong>Tailscale</strong>
                  <span>安装后自动组虚拟局域网，手机也能用</span>
                  <a
                    href="https://tailscale.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    tailscale.com
                  </a>
                </div>
                <div className="guide-item">
                  <strong>ZeroTier</strong>
                  <span>类似 Tailscale 的虚拟局域网工具</span>
                  <a
                    href="https://www.zerotier.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    zerotier.com
                  </a>
                </div>
                <div className="guide-item">
                  <strong>Cloudflare Tunnel</strong>
                  <span>免费HTTPS，无需公网IP</span>
                  <code>
                    cloudflared tunnel --url http://localhost:{networkPort}
                  </code>
                </div>
                <div className="guide-item">
                  <strong>Caddy 反向代理</strong>
                  <span>自有VPS + 域名，自动HTTPS</span>
                  <code>reverse_proxy localhost:{networkPort}</code>
                </div>
              </div>
            )}
          </div>

          <div className="drawer-divider" />

          <div className="drawer-section drawer-about">
            <h3>MostBox</h3>
            <p>版本 0.0.4</p>
            <p className="drawer-subtitle">Hyperswarm · Hyperdrive · IPFS</p>
          </div>
        </div>

        <div className="drawer-footer">
          <button
            onClick={() => {
              onClose()
              handleShutdown()
            }}
            className="btn danger full btn-shutdown"
          >
            <Power size={16} /> 关闭服务
          </button>
        </div>
      </div>
    </>
  )
}

export default SettingsDrawer
