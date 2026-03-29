import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.logger.transports.console.level = 'debug';

log.info('MostBox starting...');
log.info(`Version: ${app.getVersion()}`);
log.info(`Platform: ${process.platform}`);

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance is running, quitting...');
  app.quit();
}

autoUpdater.checkOnNewVersion = false;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../../core/public/icons/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log.info('Main window shown');
  });

  const corePath = path.join(__dirname, '../core/public');
  const indexPath = path.join(corePath, 'index.html');
  
  log.info(`Loading: ${indexPath}`);
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

app.whenReady().then(() => {
  log.info('App ready');
  createWindow();

  autoUpdater.checkForUpdates().catch(err => {
    log.error('Update check failed:', err.message);
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for updates...');
  sendToRenderer('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  log.info(`Update available: ${info.version}`);
  sendToRenderer('update-status', { status: 'available', version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('No update available');
  sendToRenderer('update-status', { status: 'not-available' });
});

autoUpdater.on('download-progress', (progress) => {
  log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
  sendToRenderer('update-status', { 
    status: 'downloading', 
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total
  });
});

autoUpdater.on('update-downloaded', (info) => {
  log.info(`Update downloaded: ${info.version}`);
  sendToRenderer('update-status', { status: 'downloaded', version: info.version });
  
  log.info('Installing update and restarting...');
  autoUpdater.quitAndInstall(false, true);
});

autoUpdater.on('error', (err) => {
  log.error('Update error:', err.message);
  sendToRenderer('update-status', { status: 'error', message: err.message });
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('get-platform', () => process.platform);

ipcMain.handle('check-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (err) {
    log.error('Manual update check failed:', err.message);
    return null;
  }
});

ipcMain.handle('get-update-info', () => {
  return {
    currentVersion: app.getVersion(),
    autoUpdater: {
      checkOnNewVersion: autoUpdater.checkOnNewVersion,
      autoDownload: autoUpdater.autoDownload
    }
  };
});
