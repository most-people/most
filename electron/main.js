import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  shell,
} from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import {
  getAvailableUpdate,
  getCurrentArch,
  getCurrentPlatform,
  getReleaseManifestUrl,
} from './updateChecker.js'
import {
  createMostDeepLinkTarget,
  findMostDeepLinkArg,
} from './deepLink.js'
import { calculateCid } from '../server/src/core/cid.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 1976

let mainWindow = null
let engine = null
let tray = null
let isQuitting = false
let hasCheckedForUpdates = false
let pendingDeepLinkUrl = ''
let updateState = {
  status: 'idle',
  version: '',
  filename: '',
  source: '',
  progress: 0,
  error: '',
  path: '',
  cid: '',
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

function getIconCandidates() {
  return [
    path.join(__dirname, '..', 'out', 'logo.ico'),
    path.join(process.resourcesPath, 'app', 'out', 'logo.ico'),
    path.join(__dirname, '..', 'public', 'logo.ico'),
    path.join(__dirname, '..', 'out', 'logo-512.png'),
    path.join(process.resourcesPath, 'app', 'out', 'logo-512.png'),
    path.join(__dirname, '..', 'public', 'logo-512.png'),
    path.join(__dirname, '..', 'out', 'logo.svg'),
    path.join(process.resourcesPath, 'app', 'out', 'logo.svg'),
    path.join(__dirname, '..', 'public', 'logo.svg'),
  ]
}

function getIconPath() {
  return getIconCandidates().find(candidate => fs.existsSync(candidate))
}

function createNativeIcon() {
  for (const candidate of getIconCandidates()) {
    if (!fs.existsSync(candidate)) continue

    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) {
      return image
    }
  }

  return nativeImage.createEmpty()
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function getLocalAppUrl(routePath = '/') {
  return new URL(routePath, `http://localhost:${PORT}`).toString()
}

function getInitialWindowUrl() {
  const initialUrl = pendingDeepLinkUrl || getLocalAppUrl('/')
  pendingDeepLinkUrl = ''
  return initialUrl
}

function getPublicUpdateState() {
  return {
    status: updateState.status,
    version: updateState.version,
    filename: updateState.filename,
    source: updateState.source,
    progress: updateState.progress,
    error: updateState.error,
    cid: updateState.cid,
  }
}

function setUpdateState(patch) {
  updateState = {
    ...updateState,
    ...patch,
  }
  mainWindow?.webContents.send('updates:state', getPublicUpdateState())
}

function getUpdateAssetFilename(update) {
  return path.basename(
    update.asset.filename ||
      `MostBox-${update.version}-${getCurrentPlatform()}-${getCurrentArch()}`
  )
}

function getSafeVersionDir(version) {
  return String(version || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getUpdateCachePath(update) {
  const filename = getUpdateAssetFilename(update)
  return path.join(
    app.getPath('userData'),
    'updates',
    getSafeVersionDir(update.version),
    filename
  )
}

async function verifyFileCid(filePath, expectedCid) {
  const { cid } = await calculateCid(filePath)
  const actualCid = cid.toString()
  if (actualCid !== expectedCid) {
    throw new Error(
      `Update CID mismatch. Expected ${expectedCid}, got ${actualCid}.`
    )
  }
}

function registerMostProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('most', process.execPath, [
      path.resolve(process.argv[1]),
    ])
    return
  }

  app.setAsDefaultProtocolClient('most')
}

function registerUpdateIpc() {
  ipcMain.handle('updates:get-state', () => getPublicUpdateState())
  ipcMain.handle('updates:install-and-restart', async () => {
    await installDownloadedUpdate()
    return getPublicUpdateState()
  })
}

function openMostDeepLink(link) {
  const targetUrl = createMostDeepLinkTarget(
    link,
    `http://localhost:${PORT}`
  )
  if (!targetUrl) return

  pendingDeepLinkUrl = targetUrl
  if (!mainWindow) {
    return
  }

  showMainWindow()
  mainWindow.loadURL(targetUrl)
  pendingDeepLinkUrl = ''
}

function quitFromTray() {
  isQuitting = true
  if (tray) {
    tray.destroy()
    tray = null
  }
  app.quit()
}

function createTray() {
  if (tray) {
    return
  }

  tray = new Tray(createNativeIcon())
  tray.setToolTip('MostBox')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 MostBox', click: showMainWindow },
      { type: 'separator' },
      { label: '退出', click: quitFromTray },
    ])
  )
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

function createWindow() {
  const iconPath = getIconPath()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'MostBox',
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadURL(getInitialWindowUrl())

  mainWindow.on('close', event => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function startServer() {
  process.env.ELECTRON_APP = 'true'

  const { main } = await import('../server/index.js')
  engine = await main()
}

async function fetchReleaseManifest(manifestUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(manifestUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadUpdateFromHttp(update, targetPath) {
  if (!update.downloadUrl) {
    throw new Error('No HTTP fallback URL is available for this update')
  }

  const tempPath = `${targetPath}.http.part`
  fs.rmSync(tempPath, { force: true })
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })

  const response = await fetch(update.downloadUrl, { cache: 'no-store' })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP update download failed: ${response.status}`)
  }

  const total = Number(response.headers.get('content-length')) || 0
  let loaded = 0

  await new Promise((resolve, reject) => {
    const rs = Readable.fromWeb(response.body)
    const ws = fs.createWriteStream(tempPath)

    const cleanup = err => {
      rs.destroy(err)
      ws.destroy()
      fs.unlink(tempPath, () => {})
    }

    rs.on('data', chunk => {
      loaded += chunk.length
      if (total > 0) {
        setUpdateState({
          status: 'downloading',
          source: 'http',
          progress: Math.min(99, Math.round((loaded / total) * 100)),
        })
      }
    })

    rs.on('error', err => {
      cleanup(err)
      reject(err)
    })
    ws.on('error', err => {
      cleanup(err)
      reject(err)
    })
    ws.on('finish', resolve)
    rs.pipe(ws)
  })

  try {
    await verifyFileCid(tempPath, update.cid)
    fs.rmSync(targetPath, { force: true })
    fs.renameSync(tempPath, targetPath)
  } catch (error) {
    fs.rmSync(tempPath, { force: true })
    throw error
  }

  try {
    await engine?.seedCidFileFromPath(update.cid, targetPath, {
      fileName: getUpdateAssetFilename(update),
      source: 'update',
    })
  } catch (error) {
    console.warn('[Electron] Update downloaded but seeding failed:', error)
  }
}

async function downloadUpdateByCid(update, targetPath) {
  if (!engine?.downloadCidToPath) {
    throw new Error('MostBox engine update download API is unavailable')
  }

  const taskId = `update_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const filename = getUpdateAssetFilename(update)

  const onProgress = data => {
    if (data?.taskId !== taskId) return
    setUpdateState({
      status: 'downloading',
      source: 'cid',
      progress: Math.min(99, Number(data.percent) || 0),
    })
  }
  const onStatus = data => {
    if (data?.taskId !== taskId) return
    setUpdateState({
      status: 'downloading',
      source: 'cid',
      filename,
    })
  }

  engine.on('download:progress', onProgress)
  engine.on('download:status', onStatus)
  try {
    await engine.downloadCidToPath({
      cid: update.cid,
      fileName: filename,
      targetPath,
      taskId,
      timeout: 30000,
      overwrite: true,
      source: 'update',
    })
  } finally {
    engine.off('download:progress', onProgress)
    engine.off('download:status', onStatus)
  }
}

async function downloadUpdate(update) {
  const targetPath = getUpdateCachePath(update)
  const filename = getUpdateAssetFilename(update)

  setUpdateState({
    status: 'downloading',
    version: update.version,
    filename,
    source: 'cid',
    progress: 0,
    error: '',
    path: '',
    cid: update.cid,
  })

  try {
    await downloadUpdateByCid(update, targetPath)
  } catch (cidError) {
    console.warn('[Electron] CID update download failed, trying fallback:', cidError)
    setUpdateState({
      status: 'downloading',
      source: 'http',
      progress: 0,
      error: '',
    })
    await downloadUpdateFromHttp(update, targetPath)
  }

  await verifyFileCid(targetPath, update.cid)
  setUpdateState({
    status: 'downloaded',
    version: update.version,
    filename,
    source: updateState.source || 'cid',
    progress: 100,
    error: '',
    path: targetPath,
    cid: update.cid,
  })
}

function quitForUpdate() {
  isQuitting = true
  if (tray) {
    tray.destroy()
    tray = null
  }
  app.quit()
}

function installWindowsUpdate(updatePath) {
  const child = spawn(updatePath, ['/S'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  quitForUpdate()
}

function getMacAppBundlePath() {
  return path.resolve(app.getPath('exe'), '../../..')
}

function installMacUpdate(updatePath) {
  const scriptPath = path.join(app.getPath('userData'), 'updates', 'install-mac.sh')
  const appBundlePath = getMacAppBundlePath()
  const script = `#!/bin/bash
set -e
APP_PATH="$1"
ZIP_PATH="$2"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
while pgrep -f "$APP_PATH/Contents/MacOS" >/dev/null 2>&1; do
  sleep 1
done
ditto -x -k "$ZIP_PATH" "$TMP_DIR"
NEW_APP="$(find "$TMP_DIR" -maxdepth 1 -name "*.app" -type d | head -n 1)"
if [ -z "$NEW_APP" ]; then
  exit 1
fi
rm -rf "$APP_PATH"
ditto "$NEW_APP" "$APP_PATH"
open "$APP_PATH"
`

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  const child = spawn('/bin/bash', [scriptPath, appBundlePath, updatePath], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  quitForUpdate()
}

function installLinuxUpdate(updatePath) {
  const currentAppImage = process.env.APPIMAGE
  if (!currentAppImage) {
    shell.openPath(updatePath).catch(() => {})
    throw new Error('当前 Linux 运行方式不支持自动替换 AppImage')
  }

  const scriptPath = path.join(app.getPath('userData'), 'updates', 'install-linux.sh')
  const script = `#!/bin/sh
set -e
APPIMAGE_PATH="$1"
UPDATE_PATH="$2"
APP_PID="$3"
while kill -0 "$APP_PID" >/dev/null 2>&1; do
  sleep 1
done
cp "$UPDATE_PATH" "$APPIMAGE_PATH"
chmod +x "$APPIMAGE_PATH"
nohup "$APPIMAGE_PATH" >/dev/null 2>&1 &
`

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  const child = spawn('/bin/sh', [scriptPath, currentAppImage, updatePath, String(process.pid)], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  quitForUpdate()
}

async function installDownloadedUpdate() {
  if (updateState.status !== 'downloaded' || !updateState.path) {
    throw new Error('No downloaded update is ready to install')
  }

  setUpdateState({ status: 'installing', error: '' })

  try {
    if (process.platform === 'win32') {
      installWindowsUpdate(updateState.path)
      return
    }
    if (process.platform === 'darwin') {
      installMacUpdate(updateState.path)
      return
    }
    if (process.platform === 'linux') {
      installLinuxUpdate(updateState.path)
      return
    }

    throw new Error('当前平台不支持自动安装更新')
  } catch (error) {
    setUpdateState({
      status: 'error',
      error: error?.message || 'Update install failed',
    })
    throw error
  }
}

async function checkForUpdates() {
  if (hasCheckedForUpdates) return
  hasCheckedForUpdates = true

  try {
    setUpdateState({
      status: 'checking',
      progress: 0,
      error: '',
    })
    const platform = getCurrentPlatform()
    const arch = getCurrentArch()
    if (!platform || !arch) {
      setUpdateState({ status: 'idle' })
      return
    }

    const manifest = await fetchReleaseManifest(getReleaseManifestUrl())
    const update = getAvailableUpdate(manifest, {
      currentVersion: app.getVersion(),
      platform,
      arch,
    })

    if (!update) {
      setUpdateState({ status: 'idle' })
      return
    }

    await downloadUpdate(update)
  } catch (error) {
    console.warn('[Electron] Update check failed:', error)
    setUpdateState({
      status: 'error',
      error: error?.message || 'Update check failed',
      progress: 0,
    })
  }
}

if (!gotSingleInstanceLock) {
  isQuitting = true
  app.quit()
} else {
  registerMostProtocolClient()
  registerUpdateIpc()
  openMostDeepLink(findMostDeepLinkArg(process.argv))

  app.on('second-instance', (_event, commandLine) => {
    const link = findMostDeepLinkArg(commandLine)
    if (link) {
      openMostDeepLink(link)
      return
    }
    showMainWindow()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    openMostDeepLink(url)
  })

  app.whenReady().then(async () => {
    try {
      await startServer()
      createWindow()
      createTray()
      Menu.setApplicationMenu(null)
      setTimeout(() => {
        checkForUpdates()
      }, 3000)

      app.on('activate', () => {
        showMainWindow()
      })
    } catch (err) {
      console.error('[Electron] Failed to start server:', err)
      isQuitting = true
      app.quit()
    }
  })
}

app.on('window-all-closed', () => {
  // Keep the daemon alive; users exit from the tray menu.
})

app.on('before-quit', () => {
  isQuitting = true
  if (engine && engine.stop) {
    engine.stop().catch(() => {})
  }
})
