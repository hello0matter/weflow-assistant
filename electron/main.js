import { app, BrowserWindow, Menu, Tray, shell, nativeImage } from 'electron'
import { startServer } from '../src/server.js'

let mainWindow = null
let tray = null
let serverHandle = null
let assistantPort = Number(process.env.ASSISTANT_PORT || 5088)

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
}

app.on('second-instance', () => {
  showMainWindow()
})

app.whenReady().then(async () => {
  serverHandle = await startServer()
  assistantPort = serverHandle.port
  createTray()
  createMainWindow()
})

app.on('activate', () => {
  showMainWindow()
})

app.on('before-quit', () => {
  if (serverHandle?.server) serverHandle.server.close()
})

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'WeFlow 助手',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.loadURL(getAssistantUrl())

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('WeFlow 助手')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 WeFlow 助手', click: showMainWindow },
    { label: '打开浏览器版', click: () => shell.openExternal(getAssistantUrl()) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true
        app.quit()
      }
    }
  ]))
  tray.on('click', showMainWindow)
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function getAssistantUrl() {
  return `http://127.0.0.1:${assistantPort}`
}
