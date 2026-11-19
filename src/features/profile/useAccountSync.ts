import { useCallback, useEffect, useState } from 'react'
import { isLocalBackendUrl } from '~server/src/utils/api'
import {
  fetchAccountSyncStatus,
  isAccountSyncAllowed,
  registerAccountSync,
  setAccountSyncAllowed,
  unregisterAccountSync,
  type AccountSyncStatus,
} from '~/lib/accountSync'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'

/** 已授权（本机或用户开启）的节点：登录或连接后自动登记同步子密钥。 */
export function useAccountSyncAutoRegister() {
  const syncKey = useUserStore(s => s.identity?.syncKey)
  const hasBackend = useAppStore(s => s.hasBackend)
  const nodeUrl = useAppStore(s => s.activeBackendUrl)

  useEffect(() => {
    if (!syncKey || !hasBackend || !isAccountSyncAllowed(nodeUrl)) return
    registerAccountSync(syncKey).catch(() => {})
  }, [syncKey, hasBackend, nodeUrl])
}

export function useAccountSync() {
  const syncKey = useUserStore(s => s.identity?.syncKey)
  const hasBackend = useAppStore(s => s.hasBackend)
  const nodeUrl = useAppStore(s => s.activeBackendUrl)
  const [status, setStatus] = useState<AccountSyncStatus | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const local = isLocalBackendUrl(nodeUrl)

  const refresh = useCallback(async () => {
    if (!syncKey || !hasBackend) {
      setStatus(null)
      return
    }
    try {
      setStatus(await fetchAccountSyncStatus())
    } catch {
      setStatus(null)
    }
  }, [syncKey, hasBackend])

  useEffect(() => {
    setAllowed(isAccountSyncAllowed(nodeUrl))
    void refresh()
  }, [nodeUrl, refresh])

  const toggle = useCallback(async () => {
    if (!syncKey || busy || local) return
    setBusy(true)
    setFailed(false)
    try {
      if (allowed) {
        await unregisterAccountSync()
        setAccountSyncAllowed(nodeUrl, false)
        setAllowed(false)
      } else {
        await registerAccountSync(syncKey)
        setAccountSyncAllowed(nodeUrl, true)
        setAllowed(true)
      }
      await refresh()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [allowed, busy, local, nodeUrl, refresh, syncKey])

  return {
    available: Boolean(syncKey && hasBackend),
    local,
    allowed,
    status,
    busy,
    failed,
    toggle,
  }
}
