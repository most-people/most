'use client'

import React, { useState } from 'react'
import {
  X,
  Download,
  Monitor,
  Apple,
  Laptop,
  Server,
  Unplug,
} from 'lucide-react'
import Link from 'next/link'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import {
  checkBackendConnectionTarget,
  clearBackendConnection,
  configureBackend,
  getBackendInviteExport,
  getRemoteBackendUrlExport,
} from '~/server/src/utils/api'

function normalizeRemoteUrlInput(value) {
  return value.trim().replace(/\/+$/, '')
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function SettingsDrawer({ onClose }) {
  const hasBackend = useAppStore(s => s.hasBackend)
  const checkBackend = useAppStore(s => s.checkBackend)
  const addToast = useAppStore(s => s.addToast)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const remoteBackendUrl = getRemoteBackendUrlExport()
  const [remoteUrl, setRemoteUrl] = useState(remoteBackendUrl)
  const [remoteInvite, setRemoteInvite] = useState(getBackendInviteExport())
  const [isConnecting, setIsConnecting] = useState(false)
  const platforms = [
    { name: 'Windows', icon: <Monitor size={16} />, ext: '.exe' },
    { name: 'macOS', icon: <Apple size={16} />, ext: '.dmg' },
    { name: 'Linux', icon: <Laptop size={16} />, ext: '.AppImage' },
  ]

  async function handleConnectRemote() {
    if (!identity) {
      openLoginModal()
      addToast('请先登录后连接远程节点', 'warning')
      return
    }
    const nextRemoteUrl = normalizeRemoteUrlInput(remoteUrl)
    if (!isHttpUrl(nextRemoteUrl)) {
      addToast('请输入有效的 http(s) 节点地址', 'warning')
      return
    }
    setIsConnecting(true)
    try {
      const connected = await checkBackendConnectionTarget({
        url: nextRemoteUrl,
        invite: remoteInvite,
      })
      if (!connected) {
        addToast('远程节点连接失败，请检查地址和邀请码', 'error')
        return
      }
      configureBackend({ url: nextRemoteUrl, invite: remoteInvite })
      setRemoteUrl(nextRemoteUrl)
      await checkBackend()
      addToast('远程节点已连接', 'success')
    } catch {
      addToast('远程节点连接失败', 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnectRemote() {
    clearBackendConnection()
    setRemoteUrl('')
    setRemoteInvite('')
    await checkBackend()
    addToast('已清除远程节点，优先使用本地节点', 'success')
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="settings-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 className="drawer-title">关于</h2>
          <button onClick={onClose} className="btn btn-icon">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-content">
          <div className="drawer-section drawer-about">
            <h3>MostBox</h3>
            <p>版本 0.1.0</p>
            <p className="drawer-subtitle">Hyperswarm · Hyperdrive · IPFS</p>
          </div>

          <div className="drawer-divider" />

          <div className="drawer-section">
            <label className="drawer-label">
              <Server size={14} className="icon-inline" />
              {remoteBackendUrl ? '修改远程节点' : '连接远程节点'}
            </label>
            <p className="drawer-hint drawer-hint-spaced">
              输入别人部署好的 MostBox
              节点地址和邀请码，无需安装客户端即可使用文件分享和聊天。
            </p>
            <div className="remote-node-form">
              <input
                className="input input-compact"
                placeholder="https://node.example.com"
                value={remoteUrl}
                onChange={event => setRemoteUrl(event.target.value)}
              />
              <input
                className="input input-compact"
                placeholder="邀请码"
                value={remoteInvite}
                onChange={event => setRemoteInvite(event.target.value)}
              />
              <button
                className="btn btn-primary btn-full"
                onClick={handleConnectRemote}
                disabled={isConnecting || !remoteUrl.trim()}
              >
                <Server size={16} />
                {isConnecting
                  ? '连接中...'
                  : remoteBackendUrl
                    ? '更新连接'
                    : '连接节点'}
              </button>
              {remoteBackendUrl && (
                <button
                  className="btn btn-secondary btn-full"
                  onClick={handleDisconnectRemote}
                  disabled={isConnecting}
                >
                  <Unplug size={16} />
                  清除远程配置
                </button>
              )}
            </div>
            {remoteBackendUrl && (
              <p className="drawer-status">当前远程节点：{remoteBackendUrl}</p>
            )}
          </div>

          {hasBackend === false && (
            <>
              <div className="drawer-divider" />

              <div className="drawer-section">
                <label className="drawer-label">
                  <Download size={14} className="icon-inline" />
                  下载桌面客户端
                </label>
                <p className="drawer-hint drawer-hint-spaced">
                  Web 端仅用于界面展示。下载桌面客户端获得完整的 P2P
                  文件分享和加密聊天体验。
                </p>
                <div className="download-platforms-mini">
                  {platforms.map(p => (
                    <Link
                      key={p.name}
                      href="/download"
                      className="download-platform-mini"
                      onClick={onClose}
                    >
                      {p.icon}
                      <span>{p.name}</span>
                      <span className="download-platform-mini-ext">
                        {p.ext}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="drawer-divider" />

              <div className="drawer-section">
                <label className="drawer-label">说明</label>
                <div className="drawer-note">
                  <p>桌面客户端提供以下完整功能：</p>
                  <ul>
                    <li>P2P 文件分享与下载</li>
                    <li>加密频道聊天</li>
                    <li>本地持久化存储</li>
                    <li>离线消息同步</li>
                    <li>大文件无限制传输</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default SettingsDrawer
