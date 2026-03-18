const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('mostBox', {
  // P2P Operations
  getNodeId: () => ipcRenderer.invoke('get-node-id'),
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  publishFile: (filePath, fileName) => 
    ipcRenderer.invoke('publish-file', { filePath, fileName }),
  downloadFile: (link) => 
    ipcRenderer.invoke('download-file', { link }),
  listPublishedFiles: () => 
    ipcRenderer.invoke('list-published-files'),
  deletePublishedFile: (cid) => 
    ipcRenderer.invoke('delete-published-file', { cid }),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Event listeners (progress, status updates)
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download:progress', (_, data) => callback(data));
  },
  onDownloadStatus: (callback) => {
    ipcRenderer.on('download:status', (_, data) => callback(data));
  },
  onDownloadSuccess: (callback) => {
    ipcRenderer.on('download:success', (_, data) => callback(data));
  },
  onPublishProgress: (callback) => {
    ipcRenderer.on('publish:progress', (_, data) => callback(data));
  },
  onPublishSuccess: (callback) => {
    ipcRenderer.on('publish:success', (_, data) => callback(data));
  },
  onNetworkStatus: (callback) => {
    ipcRenderer.on('network:status', (_, data) => callback(data));
  },
  onEngineReady: (callback) => {
    ipcRenderer.on('engine:ready', () => callback());
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});