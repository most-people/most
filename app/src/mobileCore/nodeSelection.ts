import type { MobileCoreSnapshot, RemoteNodeConfig } from './types'

export function hasActiveTransfers(snapshot: MobileCoreSnapshot) {
  return snapshot.transfers.some(
    transfer =>
      transfer.status === 'queued' ||
      transfer.status === 'running' ||
      transfer.status === 'waitingCore'
  )
}

export async function startPreferredOrLocal<T>(input: {
  preferred: RemoteNodeConfig | null
  startRemote: (config: RemoteNodeConfig) => Promise<T>
  startLocal: () => Promise<T>
  /** 本机 daemon 以远程节点方式连接时（如 Web），本机分支沿用该配置 */
  localConfig?: RemoteNodeConfig | null
}) {
  const localMode = input.localConfig ? ('remote' as const) : ('local' as const)
  const localConfig = input.localConfig || null
  if (input.preferred) {
    try {
      return {
        mode: 'remote' as const,
        node: await input.startRemote(input.preferred),
        config: input.preferred,
        fallbackFrom: '',
      }
    } catch {
      return {
        mode: localMode,
        node: await input.startLocal(),
        config: localConfig,
        fallbackFrom: input.preferred.url,
      }
    }
  }

  return {
    mode: localMode,
    node: await input.startLocal(),
    config: localConfig,
    fallbackFrom: '',
  }
}

export async function startLocalOrPreferred<T>(input: {
  preferred: RemoteNodeConfig | null
  startRemote: (config: RemoteNodeConfig) => Promise<T>
  startLocal: () => Promise<T>
  localConfig?: RemoteNodeConfig | null
}) {
  try {
    return {
      mode: input.localConfig ? ('remote' as const) : ('local' as const),
      node: await input.startLocal(),
      config: input.localConfig || null,
      fallbackFrom: '',
    }
  } catch (localError) {
    if (!input.preferred) throw localError

    return {
      mode: 'remote' as const,
      node: await input.startRemote(input.preferred),
      config: input.preferred,
      fallbackFrom: '',
    }
  }
}
