import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mostbox', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  
  onUpdateStatus: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  }
});
