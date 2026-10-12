'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  window: (action) => ipcRenderer.send('window', action)
})
