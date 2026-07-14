import { useEffect, useState } from 'react'
import { useDisclosure, useClipboard, useHotkeys } from '@mantine/hooks'

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

export function useCountdownSeconds(active: boolean, durationMs: number) {
  const totalSeconds = Math.ceil(durationMs / 1000)
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds)

  useEffect(() => {
    if (!active) {
      setRemainingSeconds(totalSeconds)
      return
    }

    const deadline = Date.now() + durationMs
    const updateRemaining = () => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      )
    }
    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [active, durationMs, totalSeconds])

  return remainingSeconds
}

export { useDisclosure, useClipboard, useHotkeys }
