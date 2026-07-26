const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getDefaultNoteVaultDirectory: () =>
    ipcRenderer.invoke('note-vault:get-default-directory'),
  selectNoteVaultDirectory: () =>
    ipcRenderer.invoke('note-vault:select-directory'),
})
