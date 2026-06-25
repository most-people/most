/// <reference types="vite/client" />

declare module '*.css'

interface Window {
  electronAPI?: {
    platform?: string
    isElectron?: boolean
    selectNoteVaultDirectory?: () => Promise<string | null>
  }
}
