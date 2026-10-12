'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { app, safeStorage } = require('electron')

/**
 * @typedef {object} Prefs
 * @property {string} outDir
 * @property {string} lastUrl
 * @property {boolean} bundleFonts
 * @property {boolean} resizable
 * @property {boolean} frame
 */

/** @type {{ token: string | null, prefs: Prefs } | null} */
let data = null
/** @type {string | null} */
let sessionToken = null

function file () {
  return path.join(app.getPath('userData'), 'settings.json')
}

function defaults () {
  return {
    token: null,
    prefs: {
      outDir: path.join(app.getPath('documents'), 'Figmaify'),
      lastUrl: '',
      bundleFonts: true,
      resizable: true,
      frame: true
    }
  }
}

function load () {
  if (data) return data
  data = defaults()
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'))
    if (typeof saved.token === 'string') data.token = saved.token
    Object.assign(data.prefs, pick(saved.prefs || {}))
  } catch {}
  return data
}

function save () {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(load(), null, 2))
  } catch {}
}

/** @param {any} input @returns {Partial<Prefs>} */
function pick (input) {
  /** @type {Partial<Prefs>} */
  const out = {}
  if (typeof input.outDir === 'string' && path.isAbsolute(input.outDir)) out.outDir = input.outDir
  if (typeof input.lastUrl === 'string') out.lastUrl = input.lastUrl.slice(0, 2000)
  for (const key of /** @type {const} */ (['bundleFonts', 'resizable', 'frame'])) {
    if (typeof input[key] === 'boolean') out[key] = input[key]
  }
  return out
}

function prefs () {
  return { ...load().prefs }
}

/** @param {any} changes */
function setPrefs (changes) {
  Object.assign(load().prefs, pick(changes || {}))
  save()
}

/**
 * The token is encrypted with the OS (DPAPI on Windows). When that isn't
 * available it only lives for this session.
 * @returns {string | null}
 */
function getToken () {
  if (sessionToken) return sessionToken
  const stored = load().token
  if (!stored || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

/** @param {string} token @returns {'saved' | 'session'} */
function setToken (token) {
  if (safeStorage.isEncryptionAvailable()) {
    load().token = safeStorage.encryptString(token).toString('base64')
    sessionToken = null
    save()
    return 'saved'
  }
  sessionToken = token
  return 'session'
}

function clearToken () {
  sessionToken = null
  load().token = null
  save()
}

function tokenStorage () {
  if (sessionToken) return 'session'
  return getToken() ? 'saved' : null
}

module.exports = { prefs, setPrefs, getToken, setToken, clearToken, tokenStorage }
