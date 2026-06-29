import { useEffect, useState } from 'react'
import {
  useMediaQuery,
  useDisclosure,
  useClipboard,
  useHotkeys,
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

export { useMediaQuery, useDisclosure, useClipboard, useHotkeys }
