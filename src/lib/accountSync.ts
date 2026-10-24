import { api, isLocalBackendUrl } from '~server/src/utils/api'

const ALLOWED_NODES_KEY = 'mostbox_account_sync_nodes'

export interface AccountSyncStatus {
  registered: boolean
  deviceId?: string
  writerCores?: number
  entries?: number
}

function readAllowedNodes(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALLOWED_NODES_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter(item => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

/** 本机节点自动同步；远程节点要用户明确授权，因为同步子密钥能解开该账号的同步内容。 */
export function isAccountSyncAllowed(nodeUrl: string) {
  return isLocalBackendUrl(nodeUrl) || readAllowedNodes().includes(nodeUrl)
}

export function setAccountSyncAllowed(nodeUrl: string, allowed: boolean) {
  const rest = readAllowedNodes().filter(item => item !== nodeUrl)
  localStorage.setItem(
    ALLOWED_NODES_KEY,
    JSON.stringify(allowed ? [...rest, nodeUrl] : rest)
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
