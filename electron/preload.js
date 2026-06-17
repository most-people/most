import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  updates: {
    getState: () => ipcRenderer.invoke('updates:get-state'),
    installAndRestart: () => ipcRenderer.invoke('updates:install-and-restart'),
    onStateChange: callback => {
      if (typeof callback !== 'function') return () => {}

      const listener = (_event, state) => {
        callback(state)
      }
      ipcRenderer.on('updates:state', listener)
      return () => {
        ipcRenderer.off('updates:state', listener)
      }
    },
  },
})
