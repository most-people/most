import { api, isLocalBackendUrl } from '~server/src/utils/api'

const DISABLED_NODES_KEY = 'mostbox_account_sync_disabled_nodes'

export interface AccountSyncStatus {
  registered: boolean
  deviceId?: string
  writerCores?: number
  entries?: number
}

function readDisabledNodes(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISABLED_NODES_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter(item => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * 默认开启：本机节点始终同步；远程节点除非用户在该节点上关闭过，否则也同步。
 * 开启意味着该节点持有同步子密钥，能解开该账号的同步内容。
 */
export function isAccountSyncAllowed(nodeUrl: string) {
  return isLocalBackendUrl(nodeUrl) || !readDisabledNodes().includes(nodeUrl)
}

export function setAccountSyncAllowed(nodeUrl: string, allowed: boolean) {
  const rest = readDisabledNodes().filter(item => item !== nodeUrl)
  localStorage.setItem(
    DISABLED_NODES_KEY,
    JSON.stringify(allowed ? rest : [...rest, nodeUrl])
  )
}

export async function registerAccountSync(syncKey: string) {
  await api.put('/api/user/sync', { json: { syncKey } }).json()
}

export async function unregisterAccountSync() {
  await api.delete('/api/user/sync').json()
}

export function fetchAccountSyncStatus() {
  return api.get<AccountSyncStatus>('/api/user/sync').json()
}
