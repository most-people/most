/// <reference types="vite/client" />

declare module '*.css'

interface Window {
  electronAPI?: {
    platform?: string
    isElectron?: boolean
    getDefaultNoteVaultDirectory?: () => Promise<string>
    selectNoteVaultDirectory?: () => Promise<string | null>
  }
}
