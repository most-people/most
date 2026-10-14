import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core'

type BackgroundEvents = { change: (event: { running: boolean }) => void }
declare class BackgroundModule extends NativeModule<BackgroundEvents> {
  isRunning(): boolean
  start(title: string, body: string, stopLabel: string): Promise<void>
  stop(): Promise<void>
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<BackgroundModule>('MostBackground')
    : null

export function useBackgroundService() {
  const [running, setRunning] = useState(native?.isRunning() === true)
  useEffect(() => {
    const change = native?.addListener('change', event =>
      setRunning(event.running)
    )
    const visibility = AppState.addEventListener('change', () =>
      setRunning(native?.isRunning() === true)
    )
    return () => {
      change?.remove()
      visibility.remove()
    }
  }, [])
  return {
    available: native !== null,
    running,
    start: async (title: string, body: string, stopLabel: string) => {
      if (!native) throw new Error('Background service unavailable')
      await native.start(title, body, stopLabel)
    },
    stop: async () => {
      await native?.stop()
    },
  }
}

export async function stopBackgroundService() {
  await native?.stop()
}
