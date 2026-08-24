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
}) {
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
        mode: 'local' as const,
        node: await input.startLocal(),
        config: null,
        fallbackFrom: input.preferred.url,
      }
    }
  }

  return {
    mode: 'local' as const,
    node: await input.startLocal(),
    config: null,
    fallbackFrom: '',
  }
}
