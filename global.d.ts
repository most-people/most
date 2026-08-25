/// <reference types="vite/client" />

declare module '*.css'

interface Window {
  electronAPI?: {
    platform?: string
    isElectron?: boolean
    openPasskeyLab?: (url: string) => Promise<boolean>
    onPasskeyLabCallback?: (callback: (url: string) => void) => () => void
  }
}
