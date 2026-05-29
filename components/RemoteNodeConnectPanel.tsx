'use client'

import { useState } from 'react'
import { Server, Unplug } from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'
import {
  checkBackendConnectionTarget,
  clearBackendConnection,
  configureBackend,
  getBackendInviteExport,
  getRemoteBackendUrlExport,
  setBackendUrl,
} from '~/server/src/utils/api'

interface RemoteNodeConnectPanelProps {
  variant?: 'page' | 'drawer'
}

function normalizeRemoteUrlInput(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export default function RemoteNodeConnectPanel({
  variant = 'page',
}: RemoteNodeConnectPanelProps) {
  const checkBackend = useAppStore(s => s.checkBackend)
  const addToast = useAppStore(s => s.addToast)
  const remoteBackendUrl = getRemoteBackendUrlExport()
  const [remoteUrl, setRemoteUrl] = useState(remoteBackendUrl)
  const [remoteInvite, setRemoteInvite] = useState(getBackendInviteExport())
  const [isConnecting, setIsConnecting] = useState(false)
  const title = remoteBackendUrl ? '修改远程节点' : '连接远程节点'
  const hint =
    '输入别人部署好的 MostBox 节点地址和邀请码，无需安装客户端即可使用文件分享和聊天。'
  const isPage = variant === 'page'

  async function handleConnectRemote() {
    const nextRemoteUrl = normalizeRemoteUrlInput(remoteUrl)
    if (!isHttpUrl(nextRemoteUrl)) {
      addToast('请输入有效的 http(s) 节点地址', 'warning')
      return
    }
    setIsConnecting(true)
    try {
      const { ok, reason } = await checkBackendConnectionTarget({
        url: nextRemoteUrl,
        invite: remoteInvite,
      })
      if (!ok) {
        if (reason === 'http') {
          addToast('远程节点 HTTP 不可达，请检查地址', 'error')
        } else if (reason === 'ws') {
          addToast('远程节点 WebSocket 不可达，请检查地址或代理配置', 'error')
        } else {
          addToast('远程节点连接失败，请检查地址和邀请码', 'error')
        }
        return
      }
      configureBackend({ url: nextRemoteUrl, invite: remoteInvite })
      setRemoteUrl(nextRemoteUrl)
      setBackendUrl(nextRemoteUrl)
      useAppStore.setState({ hasBackend: true })
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
    <div className={`remote-node-connect remote-node-connect-${variant}`}>
      {isPage ? (
        <div className="remote-node-connect-heading">
          <Server size={20} />
          <div>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
        </div>
      ) : (
        <>
          <label className="drawer-label">
            <Server size={14} className="icon-inline" />
            {title}
          </label>
          <p className="drawer-hint drawer-hint-spaced">{hint}</p>
        </>
      )}

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
            断开连接
          </button>
        )}
      </div>
      {remoteBackendUrl && (
        <p className={isPage ? 'remote-node-status' : 'drawer-status'}>
          当前远程节点：{remoteBackendUrl}
        </p>
      )}
    </div>
  )
}
