import { useCallback, useEffect, useState } from 'react'

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface DesktopUpdateState {
  status: DesktopUpdateStatus
  version: string
  filename: string
  source: string
  progress: number
  error: string
  cid: string
}

interface ElectronUpdatesApi {
  getState: () => Promise<unknown>
  installAndRestart: () => Promise<unknown>
  onStateChange: (callback: (state: unknown) => void) => () => void
}

type DesktopUpdateWindow = Window & {
  electronAPI?: {
    isElectron?: boolean
    updates?: ElectronUpdatesApi
  }
}

const DEFAULT_UPDATE_STATE: DesktopUpdateState = {
  status: 'idle',
  version: '',
  filename: '',
  source: '',
  progress: 0,
  error: '',
  cid: '',
}

const UPDATE_STATUSES = new Set<DesktopUpdateStatus>([
  'idle',
  'checking',
  'downloading',
  'downloaded',
  'installing',
  'error',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function readProgress(record: Record<string, unknown>) {
  const value = Number(record.progress)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeDesktopUpdateState(value: unknown): DesktopUpdateState {
  if (!isRecord(value)) return DEFAULT_UPDATE_STATE
  const status = readString(value, 'status')

  return {
    status: UPDATE_STATUSES.has(status as DesktopUpdateStatus)
      ? (status as DesktopUpdateStatus)
      : 'idle',
    version: readString(value, 'version'),
    filename: readString(value, 'filename'),
    source: readString(value, 'source'),
    progress: readProgress(value),
    error: readString(value, 'error'),
    cid: readString(value, 'cid'),
  }
}

function getUpdatesApi() {
  if (typeof window === 'undefined') return null
  const electronAPI = (window as DesktopUpdateWindow).electronAPI
  if (electronAPI?.isElectron !== true) return null
  return electronAPI.updates || null
}

export function useDesktopUpdate() {
  const [state, setState] = useState<DesktopUpdateState>(DEFAULT_UPDATE_STATE)

  useEffect(() => {
    const updatesApi = getUpdatesApi()
    if (!updatesApi) return undefined

    let active = true
    updatesApi
      .getState()
      .then(nextState => {
        if (active) setState(normalizeDesktopUpdateState(nextState))
      })
      .catch(() => {})

    const unsubscribe = updatesApi.onStateChange(nextState => {
      setState(normalizeDesktopUpdateState(nextState))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const installAndRestart = useCallback(async () => {
    const updatesApi = getUpdatesApi()
    if (!updatesApi) return
    await updatesApi.installAndRestart()
  }, [])

  return {
    state,
    installAndRestart,
    isSupported: getUpdatesApi() !== null,
  }
}
