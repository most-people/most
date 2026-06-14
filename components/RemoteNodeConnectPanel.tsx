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
import { useI18n } from '~/lib/i18n'

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
  const { t } = useI18n()
  const title = remoteBackendUrl
    ? t('remote.title.edit')
    : t('remote.title.connect')
  const hint = t('remote.hint')
  const isPage = variant === 'page'

  async function handleConnectRemote() {
    const nextRemoteUrl = normalizeRemoteUrlInput(remoteUrl)
    if (!isHttpUrl(nextRemoteUrl)) {
      addToast(t('remote.error.invalidUrl'), 'warning')
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
          addToast(t('remote.error.http'), 'error')
        } else if (reason === 'ws') {
          addToast(t('remote.error.ws'), 'error')
        } else {
          addToast(t('remote.error.failed'), 'error')
        }
        return
      }
      configureBackend({ url: nextRemoteUrl, invite: remoteInvite })
      setRemoteUrl(nextRemoteUrl)
      setBackendUrl(nextRemoteUrl)
      useAppStore.setState({ hasBackend: true })
      addToast(t('remote.connected'), 'success')
    } catch {
      addToast(t('remote.connectFailed'), 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnectRemote() {
    clearBackendConnection()
    setRemoteUrl('')
    setRemoteInvite('')
    await checkBackend()
    addToast(t('remote.cleared'), 'success')
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
          placeholder={t('remote.invite.placeholder')}
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
            ? t('remote.connecting')
            : remoteBackendUrl
              ? t('remote.updateConnection')
              : t('remote.connectNode')}
        </button>
        {remoteBackendUrl && (
          <button
            className="btn btn-secondary btn-full"
            onClick={handleDisconnectRemote}
            disabled={isConnecting}
          >
            <Unplug size={16} />
            {t('remote.disconnect')}
          </button>
        )}
      </div>
      {remoteBackendUrl && (
        <p className={isPage ? 'remote-node-status' : 'drawer-status'}>
          {t('remote.currentNode', { url: remoteBackendUrl })}
        </p>
      )}
    </div>
  )
}
