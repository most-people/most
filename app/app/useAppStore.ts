import { create } from 'zustand'
import {
  checkBackendConnection,
  detectSameOriginBackend,
  detectLocalhostBackend,
  setBackendUrl,
  getBackendUrlExport,
} from '~/server/src/utils/api'

interface ToastItem {
  id: number
  message: string
  type: string
}

interface AppState {
  // Backend
  hasBackend: boolean | null
  checkBackend: () => Promise<void>

  // Theme
  isDarkMode: boolean
  setIsDarkMode: (v: boolean) => void

  // Toast
  toasts: ToastItem[]
  addToast: (message: string, type?: string) => void
  removeToast: (id: number) => void

  // Settings
  showSettings: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const useAppStore = create<AppState>(set => ({
  // Backend
  hasBackend: null,
  checkBackend: async () => {
    const existing = getBackendUrlExport()
    if (existing) {
      const connected = await checkBackendConnection()
      if (connected) {
        setBackendUrl(existing)
        set({ hasBackend: true })
        return
      }
    }
    const sameOrigin = await detectSameOriginBackend()
    if (sameOrigin) {
      setBackendUrl('')
      set({ hasBackend: true })
      return
    }
    const localhost = await detectLocalhostBackend()
    if (localhost) {
      setBackendUrl('http://localhost:1976')
      set({ hasBackend: true })
    } else {
      set({ hasBackend: false })
    }
  },

  // Theme
  isDarkMode: false,
  setIsDarkMode: v => {
    set({ isDarkMode: v })
    document.documentElement.setAttribute('data-theme', v ? 'dark' : 'light')
    localStorage.setItem('theme', v ? 'dark' : 'light')
  },

  // Toast
  toasts: [],
  addToast: (message, type = 'info') => {
    set(state => ({
      toasts: [...state.toasts, { id: Date.now(), message, type }],
    }))
  },
  removeToast: id => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }))
  },

  // Settings
  showSettings: false,
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),
}))

// Initialize theme on module load (client-side only)
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('theme')
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  if (saved === 'dark' || (!saved && prefersDark)) {
    useAppStore.setState({ isDarkMode: true })
  }
}
