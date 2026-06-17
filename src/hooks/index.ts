import { useEffect, useState } from 'react'
import {
  useMediaQuery,
  useViewportSize,
  useDisclosure,
  useLocalStorage,
  useClipboard,
  useHotkeys,
  useToggle,
  useWindowEvent,
} from '@mantine/hooks'
import { useAppStore } from '~/stores/useAppStore'
import {
  getBackendUrlExport,
  getSameOriginBackendUrlExport,
  isLocalBackendUrlExport,
} from '~server/src/utils/api'

type ElectronRuntimeWindow = Window & {
  electronAPI?: {
    isElectron?: boolean
  }
}

export function isDesktopClientRuntime() {
  if (typeof window === 'undefined') return false
  return (window as ElectronRuntimeWindow).electronAPI?.isElectron === true
}

export function useIsDesktopClient() {
  const hasBackend = useAppStore(s => s.hasBackend)
  const [isDesktopClient, setIsDesktopClient] = useState(false)

  useEffect(() => {
    if (isDesktopClientRuntime()) {
      setIsDesktopClient(true)
      return
    }

    if (hasBackend !== true) {
      setIsDesktopClient(false)
      return
    }

    setIsDesktopClient(
      isLocalBackendUrlExport(getBackendUrlExport()) ||
        isLocalBackendUrlExport(getSameOriginBackendUrlExport())
    )
  }, [hasBackend])

  return isDesktopClient
}

export function useIsMobile(breakpoint = 768) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`)
}

export function useIsTablet(breakpoint = 1024) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`)
}

export {
  useMediaQuery,
  useViewportSize,
  useDisclosure,
  useLocalStorage,
  useClipboard,
  useHotkeys,
  useToggle,
  useWindowEvent,
}

export {
  useDesktopUpdate,
  type DesktopUpdateState,
  type DesktopUpdateStatus,
} from './useDesktopUpdate'
