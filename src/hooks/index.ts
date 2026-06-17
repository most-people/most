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

type ElectronRuntimeWindow = Window & {
  electronAPI?: {
    isElectron?: boolean
  }
}

export function isDesktopClientRuntime() {
  if (typeof window === 'undefined') return false
  if ((window as ElectronRuntimeWindow).electronAPI?.isElectron === true) {
    return true
  }
  return /\bElectron\/\d+/i.test(window.navigator?.userAgent || '')
}

export function useIsDesktopClient() {
  const [isDesktopClient, setIsDesktopClient] = useState(false)

  useEffect(() => {
    setIsDesktopClient(isDesktopClientRuntime())
  }, [])

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
