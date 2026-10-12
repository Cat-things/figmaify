'use strict'

const path = require('node:path')
const { app, BrowserWindow, Menu, ipcMain, screen, shell } = require('electron')
const config = require('./app.config.json')

function createWindow () {
  const area = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: Math.min(config.width, area.width),
    height: Math.min(config.height, area.height),
    useContentSize: true,
    resizable: config.resizable,
    maximizable: config.resizable,
    frame: config.frame,
    title: config.name,
    backgroundColor: config.background,
    icon: config.icon ? path.join(__dirname, config.icon) : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Links from the design open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  win.loadFile(path.join(__dirname, 'app', 'index.html'))
}

ipcMain.on('window', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (action === 'close') win.close()
  else if (action === 'minimize') win.minimize()
  else if (action === 'maximize') {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }
})

if (process.platform === 'win32') app.setAppUserModelId(config.appId)
Menu.setApplicationMenu(null)

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
