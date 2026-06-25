const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  selectNoteVaultDirectory: () =>
    ipcRenderer.invoke('note-vault:select-directory'),
})
