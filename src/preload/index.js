'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('figmaify', {
  getState: () => ipcRenderer.invoke('state:get'),
  setToken: (token) => ipcRenderer.invoke('token:set', token),
  clearToken: () => ipcRenderer.invoke('token:clear'),
  setPrefs: (prefs) => ipcRenderer.invoke('prefs:set', prefs),
  loadFile: (url) => ipcRenderer.invoke('file:load', url),
  chooseFolder: () => ipcRenderer.invoke('dialog:folder'),
  chooseIcon: () => ipcRenderer.invoke('dialog:icon'),
  clearIcon: () => ipcRenderer.invoke('icon:clear'),
  build: (options) => ipcRenderer.invoke('build:start', options),
  openOutput: () => ipcRenderer.invoke('shell:open-output'),
  runApp: () => ipcRenderer.invoke('shell:run-app'),
  help: (topic) => ipcRenderer.invoke('shell:help', topic),
  onLog: (callback) => {
    ipcRenderer.on('build:log', (_event, message) => callback(message))
  }
})
