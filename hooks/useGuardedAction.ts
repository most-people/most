import { useCallback } from 'react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'

interface GuardOptions {
  needBackend: boolean
  needLogin: boolean
}

export function useGuardedAction({ needBackend, needLogin }: GuardOptions) {
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)

  return useCallback(
    (action: () => void | Promise<void>) => {
      if (needBackend && hasBackend !== true) {
        openConnectModal()
        return
      }
      if (needLogin && !userIdentity) {
        openLoginModal()
        return
      }
      action()
    },
    [
      hasBackend,
      userIdentity,
      needBackend,
      needLogin,
      openConnectModal,
      openLoginModal,
    ]
  )
}
