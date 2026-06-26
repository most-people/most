export {}

declare global {
  interface Window {
    electronAPI?: {
      platform?: string
      isElectron?: boolean
      selectNoteVaultDirectory?: () => Promise<string | null>
    }
  }
}
