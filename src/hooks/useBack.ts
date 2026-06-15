import { useCallback } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useUserStore } from '~/stores/userStore'

export function useBack() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: location => location.pathname })
  const firstPath = useUserStore(s => s.firstPath)
  const setFirstPath = useUserStore(s => s.setFirstPath)

  return useCallback(() => {
    if (!firstPath || firstPath === pathname) {
      setFirstPath('/')
      void navigate({ to: '/', replace: true })
      return
    }
    window.history.back()
  }, [firstPath, navigate, pathname, setFirstPath])
}
