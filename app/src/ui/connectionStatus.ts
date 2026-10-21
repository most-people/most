import type { NodeState } from '../mobileCore/types'
import type { MessageKey } from '../i18n/messages'

export type ConnectionLevel = 'ok' | 'pending' | 'warn' | 'error'

export type ConnectionStatus = {
  level: ConnectionLevel
  titleKey: MessageKey
  detailKey: MessageKey
  /** 展示在标题/详情里的插值参数 */
  params: { count: number; source: string }
}

export type ConnectionStatusInput = {
  node: Pick<
    NodeState,
    'status' | 'mode' | 'authenticated' | 'peerCount' | 'endpoint'
  > & { error?: string }
  /** 聊天 WebSocket 是否已连上；本机节点不使用 WebSocket，传 true */
  chatConnected: boolean
  /** 是否已有需要同步的频道 */
  hasChannels: boolean
}

export function getConnectionSource(
  node: Pick<NodeState, 'mode' | 'endpoint'>
) {
  if (node.mode !== 'remote') return ''
  const endpoint = node.endpoint || ''
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

/** 把节点与聊天连接状态归并为用户可读的单一状态。 */
export function getConnectionStatus({
  node,
  chatConnected,
  hasChannels,
}: ConnectionStatusInput): ConnectionStatus {
  const params = {
    count: Math.max(0, Math.floor(node.peerCount || 0)),
    source: getConnectionSource(node),
  }
  const remote = node.mode === 'remote'
  const make = (
    level: ConnectionLevel,
    titleKey: MessageKey,
    detailKey: MessageKey
  ): ConnectionStatus => ({ level, titleKey, detailKey, params })

  if (node.status === 'starting' && remote && node.error)
    return make(
      'pending',
      'status.reconnecting.title',
      'status.reconnecting.detail'
    )
  if (node.status === 'starting')
    return make('pending', 'status.starting.title', 'status.starting.detail')
  if (node.status !== 'ready')
    return make(
      'error',
      'status.offline.title',
      remote ? 'status.offline.remoteDetail' : 'status.offline.localDetail'
    )
  if (remote && node.authenticated !== true)
    return make('warn', 'status.login.title', 'status.login.detail')
  if (remote && hasChannels && !chatConnected)
    return make(
      'pending',
      'status.reconnecting.title',
      'status.reconnecting.detail'
    )
  if (params.count === 0)
    return make('warn', 'status.alone.title', 'status.alone.detail')
  return make(
    'ok',
    'status.connected.title',
    remote ? 'status.connected.remoteDetail' : 'status.connected.localDetail'
  )
}
