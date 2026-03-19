import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { MostBoxEngine } from '@most-box/core';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let engine = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeEngine() {
  const userDataPath = app.getPath('userData');
  const storagePath = path.join(userDataPath, 'most-box-storage');
  const downloadPath = app.getPath('downloads');

  engine = new MostBoxEngine({
    storagePath,
    downloadPath
  });

  // Forward engine events to renderer
  engine.on('download:progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:progress', data);
    }
  });

  engine.on('download:status', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:status', data);
    }
  });

  engine.on('download:success', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:success', data);
    }
  });

  engine.on('publish:progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('publish:progress', data);
    }
  });

  engine.on('publish:success', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('publish:success', data);
    }
  });

  engine.on('connection', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const status = engine.getNetworkStatus();
      mainWindow.webContents.send('network:status', status);
    }
  });

  await engine.start();
  console.log('MostBox Engine initialized');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('engine:ready');
  }
}

// IPC Handlers
ipcMain.handle('get-node-id', async () => {
  if (!engine) throw new Error('Engine not initialized');
  return { id: engine.getNodeId() };
});

ipcMain.handle('get-network-status', async () => {
  if (!engine) throw new Error('Engine not initialized');
  return engine.getNetworkStatus();
});

ipcMain.handle('publish-file', async (event, { filePath, fileName }) => {
  if (!engine) throw new Error('Engine not initialized');
  try {
    const result = await engine.publishFile(filePath, fileName);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message, code: err.code };
  }
});

ipcMain.handle('download-file', async (event, { link }) => {
  if (!engine) throw new Error('Engine not initialized');
  try {
    const result = await engine.downloadFile(link);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message, code: err.code };
  }
});

ipcMain.handle('list-published-files', async () => {
  if (!engine) throw new Error('Engine not initialized');
  return engine.listPublishedFiles();
});

ipcMain.handle('delete-published-file', async (event, { cid }) => {
  if (!engine) throw new Error('Engine not initialized');
  return engine.deletePublishedFile(cid);
});

// Network diagnostics
ipcMain.handle('diagnose-network', async () => {
  const results = {
    basicConnectivity: null,
    dnsResolution: null,
    peerCount: 0
  };

  // Check basic connectivity
  try {
    const { stdout } = await execAsync('ping -n 2 8.8.8.8');
    results.basicConnectivity = {
      success: stdout.includes('TTL'),
      output: stdout.trim()
    };
  } catch (err) {
    results.basicConnectivity = {
      success: false,
      output: err.message
    };
  }

  // Check DNS resolution
  try {
    const { stdout } = await execAsync('nslookup bootstrap1.hyperswarm.org');
    results.dnsResolution = {
      success: !stdout.includes('Non-existent domain'),
      output: stdout.trim()
    };
  } catch (err) {
    results.dnsResolution = {
      success: false,
      output: err.message
    };
  }

  // Get current peer count
  if (engine) {
    const status = engine.getNetworkStatus();
    results.peerCount = status.peers;
  }

  return results;
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    await createWindow();
    await initializeEngine();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    console.error('Failed to initialize:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (engine) {
    await engine.stop();
  }
});