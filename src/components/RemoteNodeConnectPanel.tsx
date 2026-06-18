import { useState } from 'react'
import { CheckCircle2, History, Server, Unplug } from 'lucide-react'
import { useAppStore } from '~/stores/useAppStore'
import {
  checkBackendConnectionTarget,
  clearBackendConnection,
  configureBackend,
  getBackendUrlExport,
  getRemoteInviteExport,
  getNodeHistoryExport,
  getRemoteUrlExport,
} from '~server/src/utils/api'
import { useI18n } from '~/lib/i18n'

interface RemoteNodeConnectPanelProps {
  variant?: 'page' | 'drawer'
}

interface RemoteNode {
  url: string
  invite: string
  active?: boolean
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

function formatRemoteNodeHost(value: string) {
  try {
    const url = new URL(value)
    return url.host
  } catch {
    return value
  }
}

export default function RemoteNodeConnectPanel({
  variant = 'page',
}: RemoteNodeConnectPanelProps) {
  const checkBackend = useAppStore(s => s.checkBackend)
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const activeBackendUrl = normalizeRemoteUrlInput(getBackendUrlExport())
  const activeRemoteUrl = normalizeRemoteUrlInput(getRemoteUrlExport())
  const activeUrl =
    activeRemoteUrl && activeRemoteUrl === activeBackendUrl
      ? activeRemoteUrl
      : ''
  const currentBackendUrl = hasBackend === true ? activeBackendUrl : ''
  const [urlInput, setUrlInput] = useState(activeUrl)
  const [inviteInput, setInviteInput] = useState(getRemoteInviteExport())
  const [nodes, setNodes] = useState<RemoteNode[]>(() =>
    getNodeHistoryExport()
  )
  const [isConnecting, setIsConnecting] = useState(false)
  const { t } = useI18n()
  const title = activeUrl
    ? t('remote.title.edit')
    : t('remote.title.connect')
  const hint = t('remote.hint')
  const isPage = variant === 'page'

  function refreshNodes() {
    setNodes(getNodeHistoryExport())
  }

  async function connectRemote(url: string, invite: string) {
    const nextUrl = normalizeRemoteUrlInput(url)
    const nextInvite = invite.trim()

    setUrlInput(nextUrl)
    setInviteInput(nextInvite)

    if (!isHttpUrl(nextUrl)) {
      addToast(t('remote.error.invalidUrl'), 'warning')
      return
    }
    setIsConnecting(true)
    try {
      const { ok, reason } = await checkBackendConnectionTarget({
        url: nextUrl,
        invite: nextInvite,
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
      configureBackend({ url: nextUrl, invite: nextInvite })
      refreshNodes()
      useAppStore.setState({ hasBackend: true })
      addToast(t('remote.connected'), 'success')
    } catch {
      addToast(t('remote.connectFailed'), 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleConnectRemote() {
    await connectRemote(urlInput, inviteInput)
  }

  async function handleDisconnectRemote() {
    clearBackendConnection()
    setUrlInput('')
    setInviteInput('')
    refreshNodes()
    await checkBackend()
    refreshNodes()
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
          value={urlInput}
          onChange={event => setUrlInput(event.target.value)}
        />
        <input
          className="input input-compact"
          placeholder={t('remote.invite.placeholder')}
          value={inviteInput}
          onChange={event => setInviteInput(event.target.value)}
        />
        <button
          className="btn btn-primary btn-full"
          onClick={handleConnectRemote}
          disabled={isConnecting || !urlInput.trim()}
        >
          <Server size={16} />
          {isConnecting
            ? t('remote.connecting')
            : activeUrl
              ? t('remote.updateConnection')
              : t('remote.connectNode')}
        </button>
        {activeUrl && (
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
      {nodes.length > 0 && (
        <section
          className="remote-node-history"
          aria-label={t('remote.history.title')}
        >
          <div className="remote-node-history-title">
            <History size={14} />
            <span>{t('remote.history.title')}</span>
          </div>
          <div className="remote-node-list">
            {nodes.map(node => {
              const displayHost = formatRemoteNodeHost(node.url)
              const isCurrentNode =
                currentBackendUrl &&
                normalizeRemoteUrlInput(node.url) === currentBackendUrl

              return (
                <button
                  key={node.url}
                  type="button"
                  className={[
                    'remote-node-item',
                    isCurrentNode ? 'remote-node-item-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => connectRemote(node.url, node.invite)}
                  disabled={isConnecting}
                  title={t('remote.history.switchTo', { url: node.url })}
                >
                  <span className="remote-node-item-main">
                    <span className="remote-node-host">{displayHost}</span>
                  </span>
                  {isCurrentNode ? (
                    <span className="remote-node-badge">
                      <CheckCircle2 size={12} />
                      {t('remote.history.current')}
                    </span>
                  ) : (
                    <Server className="remote-node-idle-icon" size={14} />
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
