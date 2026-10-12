'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  shell
} = require('electron')

const settings = require('./settings')
const { parseFigmaUrl } = require('../core/figma-url')
const { createClient } = require('../core/figma-api')
const { outlineOf } = require('../core/outline')
const { build, MARKER } = require('../core/build')
const { pngsToIco, isIco } = require('../core/ico')
const { slugify, isVersion } = require('../core/names')

const ROOT = path.join(__dirname, '..', '..')
const DEV = process.argv.includes('--dev')
const HELP = {
  token: 'https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens',
  tags: 'https://github.com/Cat-things/figmaify#layer-tags'
}
const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

/** @type {BrowserWindow | null} */
let win = null
let busy = false

/**
 * The file the user loaded last. Builds always use this, never ids sent
 * from the page, so the page can't point a build at something else.
 * @type {{ fileKey: string, outline: ReturnType<typeof outlineOf> } | null}
 */
let loaded = null

/** @type {{ icon: Buffer, name: string } | null} */
let chosenIcon = null

/** @type {{ root: string, exePath: string | null } | null} */
let lastBuild = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
}

if (process.platform === 'win32') app.setAppUserModelId('com.catthings.figmaify')
Menu.setApplicationMenu(null)

function createWindow () {
  win = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 900,
    minHeight: 620,
    title: 'Figmaify',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
    icon: app.isPackaged ? undefined : path.join(ROOT, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win && win.show())
  win.on('closed', () => { win = null })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  // Without an app menu there's no right click menu either, and people
  // paste their token with the mouse.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) return
    const items = params.isEditable
      ? [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }]
      : [{ role: 'copy' }]
    Menu.buildFromTemplate(/** @type {any} */ (items)).popup()
  })

  if (DEV) {
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown' || !win) return
      if (input.key === 'F12') win.webContents.toggleDevTools()
      if (input.key === 'F5') win.webContents.reload()
    })
  }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

/** @param {string} message */
function sendLog (message) {
  if (win) win.webContents.send('build:log', message)
}

function client () {
  const token = settings.getToken()
  if (!token) throw new Error('Add a Figma access token first.')
  return createClient({ token, fetch: (url, init) => net.fetch(url, init) })
}

/** @param {string} url */
async function download (url) {
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

/** @param {string} url @param {Record<string, string>} headers */
async function fetchText (url, headers) {
  const res = await net.fetch(url, { headers })
  return res.ok ? res.text() : null
}

/**
 * Handlers return { ok, ... } objects instead of throwing, so the page gets
 * a clean message rather than Electron's wrapped error text.
 * @param {string} channel
 * @param {(...args: any[]) => Promise<any>} handler
 */
function handle (channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents) return { ok: false, error: 'Unknown sender.' }
    try {
      return Object.assign({ ok: true }, await handler(...args))
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

handle('state:get', async () => ({
  token: settings.tokenStorage(),
  prefs: settings.prefs(),
  version: app.getVersion(),
  platform: process.platform
}))

handle('token:set', async (token) => {
  const value = String(token || '').trim()
  if (value.length < 20 || /\s/.test(value)) throw new Error('That doesn\'t look like a Figma token.')
  return { token: settings.setToken(value) }
})

handle('token:clear', async () => {
  settings.clearToken()
  return {}
})

handle('prefs:set', async (changes) => {
  settings.setPrefs(changes)
  return {}
})

handle('file:load', async (url) => {
  const parsed = parseFigmaUrl(url)
  if (!parsed.ok) throw new Error(parsed.error)
  const file = await client().getFileOutline(parsed.fileKey)
  const outline = outlineOf(file)
  if (!outline.pages.some((p) => p.frames.length)) throw new Error('That file has no frames to convert.')

  loaded = { fileKey: parsed.fileKey, outline }
  settings.setPrefs({ lastUrl: String(url).trim() })
  return { outline, focus: parsed.nodeId }
})

handle('dialog:folder', async () => {
  if (!win) return { path: null }
  const result = await dialog.showOpenDialog(win, {
    title: 'Where should built apps go?',
    defaultPath: settings.prefs().outDir,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return { path: null }
  settings.setPrefs({ outDir: result.filePaths[0] })
  return { path: result.filePaths[0] }
})

handle('dialog:icon', async () => {
  if (!win) return { icon: null }
  const result = await dialog.showOpenDialog(win, {
    title: 'Pick an app icon',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'ico', 'jpg', 'jpeg'] }]
  })
  const file = result.filePaths[0]
  if (result.canceled || !file) return { icon: null }

  chosenIcon = { icon: await loadIcon(file), name: path.basename(file) }
  const preview = nativeImage.createFromBuffer(previewPng(chosenIcon.icon))
  return { icon: { name: chosenIcon.name, preview: preview.isEmpty() ? null : preview.toDataURL() } }
})

handle('icon:clear', async () => {
  chosenIcon = null
  return {}
})

handle('build:start', async (input) => {
  if (busy) throw new Error('A build is already running.')
  if (!loaded) throw new Error('Load a Figma file first.')
  const opts = validateBuild(input, loaded)

  const target = path.join(opts.outDir, slugify(opts.appName))
  if (win && await isPreviousBuild(target)) {
    const answer = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Replace', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `"${opts.appName}" was already built in that folder.`,
      detail: 'Building again replaces both the app and its source folder. Anything you changed there by hand will be lost.'
    })
    if (answer.response !== 0) return { cancelled: true }
  }

  busy = true
  try {
    const result = await build(opts, {
      client: client(),
      download,
      fetchText,
      log: sendLog,
      cacheDir: path.join(app.getPath('userData'), 'cache'),
      runtimeExe: process.platform === 'win32' ? process.execPath : null,
      rcedit: rceditPath(),
      electronVersion: process.versions.electron,
      platform: process.platform
    })
    lastBuild = { root: result.root, exePath: result.exePath }
    settings.setPrefs({ bundleFonts: opts.bundleFonts, resizable: opts.resizable, frame: opts.frame })
    return { result }
  } finally {
    busy = false
  }
})

handle('shell:open-output', async () => {
  if (!lastBuild) throw new Error('Nothing built yet.')
  const error = await shell.openPath(lastBuild.root)
  if (error) throw new Error(error)
  return {}
})

handle('shell:run-app', async () => {
  if (!lastBuild || !lastBuild.exePath) throw new Error('Nothing to run yet.')
  const child = spawn(lastBuild.exePath, [], {
    cwd: path.dirname(lastBuild.exePath),
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {})
  child.unref()
  return {}
})

handle('shell:help', async (topic) => {
  const url = /** @type {Record<string, string>} */ (HELP)[topic]
  if (url) await shell.openExternal(url)
  return {}
})

/**
 * @param {any} input
 * @param {NonNullable<typeof loaded>} file
 * @returns {import('../core/build').BuildOptions}
 */
function validateBuild (input, file) {
  const frameIds = file.outline.pages.flatMap((p) => p.frames.map((f) => f.id))
  const known = new Set(frameIds)

  const screenIds = Array.isArray(input.screenIds) ? input.screenIds.filter((/** @type {string} */ id) => known.has(id)) : []
  if (!screenIds.length) throw new Error('Pick at least one frame.')

  const startId = screenIds.includes(input.startId) ? input.startId : screenIds[0]
  const appName = String(input.appName || '').trim()
  if (!appName) throw new Error('Give the app a name.')
  const appVersion = String(input.appVersion || '').trim() || '1.0.0'
  if (!isVersion(appVersion)) throw new Error('Version has to look like 1.0.0.')

  const outDir = settings.prefs().outDir
  return {
    fileKey: file.fileKey,
    fileName: file.outline.name,
    fileVersion: file.outline.version,
    screenIds,
    frameIds,
    startId,
    appName,
    appVersion,
    frame: input.frame !== false,
    resizable: input.resizable !== false,
    bundleFonts: input.bundleFonts !== false,
    icon: chosenIcon ? chosenIcon.icon : null,
    outDir
  }
}

/** @param {string} dir */
async function isPreviousBuild (dir) {
  try {
    await fs.access(path.join(dir, MARKER))
    return true
  } catch {
    return false
  }
}

/**
 * Any PNG or JPG becomes a multi size .ico, cropped to a square from the center.
 * @param {string} file
 */
async function loadIcon (file) {
  const data = await fs.readFile(file)
  if (isIco(data)) return data

  let image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) throw new Error('Couldn\'t read that image.')
  const { width, height } = image.getSize()
  const side = Math.min(width, height)
  if (width !== height) {
    image = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
  }
  if (side < 64) throw new Error('The icon should be at least 256 by 256 pixels.')

  return pngsToIco(ICON_SIZES.map((size) => ({
    size,
    png: image.resize({ width: size, height: size, quality: 'best' }).toPNG()
  })))
}

// The largest PNG stored in our own .ico, or the whole file for other icons.
/** @param {Buffer} ico */
function previewPng (ico) {
  const count = ico.readUInt16LE(4)
  let best = null
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16
    const size = ico.readUInt8(at) || 256
    const length = ico.readUInt32LE(at + 8)
    const offset = ico.readUInt32LE(at + 12)
    const chunk = ico.subarray(offset, offset + length)
    if (chunk.length > 8 && chunk.readUInt32BE(0) === 0x89504e47 && (!best || size > best.size)) best = { size, chunk }
  }
  return best ? best.chunk : ico
}

function rceditPath () {
  if (process.platform !== 'win32') return null
  return app.isPackaged
    ? path.join(process.resourcesPath, 'rcedit-x64.exe')
    : path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
