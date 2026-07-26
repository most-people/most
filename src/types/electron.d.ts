export {}

declare global {
  interface Window {
    electronAPI?: {
      platform?: string
      isElectron?: boolean
      getDefaultNoteVaultDirectory?: () => Promise<string>
      selectNoteVaultDirectory?: () => Promise<string | null>
    }
  }
}
