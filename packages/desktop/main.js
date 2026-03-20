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
    dhtBootstrap: null,
    peerCount: 0,
    suggestions: []
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

  // Check DHT bootstrap nodes
  const bootstrapNodes = [
    'bootstrap1.hyperswarm.org',
    'bootstrap2.hyperswarm.org',
    'bootstrap3.hyperswarm.org',
    'dht.transmissionbt.com'
  ];
  
  const reachableNodes = [];
  for (const node of bootstrapNodes) {
    try {
      const { stdout } = await execAsync(`ping -n 1 ${node}`);
      if (stdout.includes('TTL') || stdout.includes('时间=')) {
        reachableNodes.push(node);
      }
    } catch (err) {
      // Node unreachable
    }
  }
  
  results.dhtBootstrap = {
    success: reachableNodes.length > 0,
    reachableNodes: reachableNodes,
    totalNodes: bootstrapNodes.length,
    output: `Reachable: ${reachableNodes.length}/${bootstrapNodes.length}`
  };

  // Get current peer count
  if (engine) {
    const status = engine.getNetworkStatus();
    results.peerCount = status.peers;
  }

  // Generate suggestions
  if (!results.basicConnectivity?.success) {
    results.suggestions.push('Check your internet connection');
  }
  
  if (!results.dnsResolution?.success) {
    results.suggestions.push('DNS resolution failed - try changing DNS servers');
  }
  
  if (!results.dhtBootstrap?.success) {
    results.suggestions.push('DHT bootstrap nodes unreachable - firewall may be blocking P2P');
    results.suggestions.push('Try disabling firewall or adding MostBox to exceptions');
  }
  
  if (results.peerCount === 0) {
    results.suggestions.push('No peers connected - publisher may be offline');
    results.suggestions.push('Wait a few minutes and try again');
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

// Check firewall rules
ipcMain.handle('check-firewall', async () => {
  const results = {
    nodeJsRule: false,
    port49737Rule: false,
    port6881Rule: false
  };

  try {
    // Check if Node.js is allowed through firewall
    const { stdout: nodeOutput } = await execAsync(
      'netsh advfirewall firewall show rule name=all | findstr /i "Node"'
    );
    results.nodeJsRule = nodeOutput.includes('Node') || nodeOutput.includes('node');
  } catch (err) {
    // Rule not found
  }

  try {
    // Check if port 49737 is allowed
    const { stdout: port49737Output } = await execAsync(
      'netsh advfirewall firewall show rule name=all | findstr "49737"'
    );
    results.port49737Rule = port49737Output.includes('49737');
  } catch (err) {
    // Rule not found
  }

  try {
    // Check if port 6881 is allowed
    const { stdout: port6881Output } = await execAsync(
      'netsh advfirewall firewall show rule name=all | findstr "6881"'
    );
    results.port6881Rule = port6881Output.includes('6881');
  } catch (err) {
    // Rule not found
  }

  return results;
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