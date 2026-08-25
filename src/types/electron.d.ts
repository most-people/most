export {}

declare global {
  interface Window {
    electronAPI?: {
      platform?: string
      isElectron?: boolean
      openPasskeyLab?: (url: string) => Promise<boolean>
      onPasskeyLabCallback?: (callback: (url: string) => void) => () => void
    }
  }
}
