import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MostBoxEngine } from '@most-people/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    if (result.alreadyExists) {
      return { success: true, alreadyExists: true, fileName: result.fileName };
    }
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

ipcMain.handle('save-as-file', async (event, { cid }) => {
  if (!engine) throw new Error('Engine not initialized');
  
  try {
    const publishedFiles = engine.listPublishedFiles();
    const file = publishedFiles.find(f => f.cid === cid);
    
    if (!file) {
      return { success: false, error: '文件不存在' };
    }
    
    if (!file.originalPath || !fs.existsSync(file.originalPath)) {
      return { success: false, error: '文件路径不存在或已被移动' };
    }
    
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '另存为',
      defaultPath: file.fileName,
      filters: [
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (canceled || !filePath) {
      return { success: false, error: '用户取消了操作' };
    }
    
    fs.copyFileSync(file.originalPath, filePath);
    
    return { success: true, savedPath: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
