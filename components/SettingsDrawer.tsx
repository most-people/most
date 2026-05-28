'use client'

import { X, Download, Monitor, Apple, Laptop } from 'lucide-react'
import Link from 'next/link'
import { useAppStore } from '~/app/app/useAppStore'
import RemoteNodeConnectPanel from '~/components/RemoteNodeConnectPanel'

function SettingsDrawer({ onClose }) {
  const hasBackend = useAppStore(s => s.hasBackend)
  const platforms = [
    { name: 'Windows', icon: <Monitor size={16} />, ext: '.exe' },
    { name: 'macOS', icon: <Apple size={16} />, ext: '.dmg' },
    { name: 'Linux', icon: <Laptop size={16} />, ext: '.AppImage' },
  ]

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
            <RemoteNodeConnectPanel variant="drawer" />
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
