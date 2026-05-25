import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.MOSTBOX_PORT) || 1976

let mainWindow = null
let engine = null
let tray = null
let isQuitting = false

function getTrayIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'out', 'favicon.ico'),
    path.join(process.resourcesPath, 'app', 'out', 'favicon.ico'),
    path.join(__dirname, '..', 'public', 'favicon.ico'),
  ]

  return candidates.find(candidate => fs.existsSync(candidate))
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

  const iconPath = getTrayIconPath()
  const image = iconPath ? nativeImage.createFromPath(iconPath) : null

  tray = new Tray(image && !image.isEmpty() ? image : nativeImage.createEmpty())
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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'MostBox',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)

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

app.whenReady().then(async () => {
  try {
    await startServer()
    createWindow()
    createTray()
    Menu.setApplicationMenu(null)

    app.on('activate', () => {
      showMainWindow()
    })
  } catch (err) {
    console.error('[Electron] Failed to start server:', err)
    isQuitting = true
    app.quit()
  }
})

app.on('window-all-closed', () => {
  // Keep the daemon alive; users exit from the tray menu.
})

app.on('before-quit', () => {
  isQuitting = true
  if (engine && engine.stop) {
    engine.stop().catch(() => {})
  }
})
