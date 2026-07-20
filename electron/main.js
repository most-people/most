import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  dialog,
  nativeImage,
  shell,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formatBytes,
  getAvailableUpdate,
  getCurrentArch,
  getCurrentPlatform,
  getReleaseManifestUrl,
} from './updateChecker.js'
import { createMostDeepLinkTarget, findMostDeepLinkArg } from './deepLink.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 1976

let mainWindow = null
let engine = null
let tray = null
let isQuitting = false
let hasCheckedForUpdates = false
let pendingDeepLinkUrl = ''

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

function registerMostProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('most', process.execPath, [
      path.resolve(process.argv[1]),
    ])
    return
  }

  app.setAsDefaultProtocolClient('most')
}

function openMostDeepLink(link) {
  const targetUrl = createMostDeepLinkTarget(link, `http://localhost:${PORT}`)
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

function registerNoteVaultIpc() {
  ipcMain.handle('note-vault:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Markdown 笔记库',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
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
      preload: path.join(__dirname, 'preload.cjs'),
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

async function checkForUpdates() {
  if (hasCheckedForUpdates) return
  hasCheckedForUpdates = true

  try {
    const platform = getCurrentPlatform()
    const arch = getCurrentArch()
    if (!platform || !arch) return

    const manifest = await fetchReleaseManifest(getReleaseManifestUrl())
    const update = getAvailableUpdate(manifest, {
      currentVersion: app.getVersion(),
      platform,
      arch,
    })

    if (!update) return

    const sizeText = formatBytes(update.asset.size)
    const detail = [
      `当前版本：${app.getVersion()}`,
      `最新版本：${update.version}`,
      sizeText ? `安装包大小：${sizeText}` : null,
      '',
      '是否现在下载当前系统版本的安装包？下载完成后请手动打开安装。',
    ]
      .filter(line => line !== null)
      .join('\n')

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['立即下载', '稍后'],
      defaultId: 0,
      cancelId: 1,
      title: '发现 MostBox 新版本',
      message: `MostBox ${update.version} 已可下载`,
      detail,
      noLink: true,
    })

    if (result.response === 0) {
      await shell.openExternal(update.downloadUrl)
    }
  } catch (error) {
    console.warn('[Electron] Update check skipped:', error)
  }
}

if (!gotSingleInstanceLock) {
  isQuitting = true
  app.quit()
} else {
  registerMostProtocolClient()
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
      registerNoteVaultIpc()
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
