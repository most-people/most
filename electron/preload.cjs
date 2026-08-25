const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  openPasskeyLab: url => ipcRenderer.invoke('passkey-lab:open', url),
  onPasskeyLabCallback: callback => {
    const listener = (_event, url) => callback(url)
    ipcRenderer.on('passkey-lab:callback', listener)
    return () => ipcRenderer.removeListener('passkey-lab:callback', listener)
  },
})
