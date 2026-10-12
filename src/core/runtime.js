'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { APP_FILES } = require('./project')

/**
 * @typedef {object} RunnableOptions
 * @property {string} runtimeExe path of the running Electron executable
 * @property {string} sourceDir the generated project
 * @property {string} targetDir where the runnable copy goes
 * @property {string} exeName file name for the copied executable
 */

/**
 * Copies the Electron runtime Figmaify itself runs on and puts the
 * generated app in resources/app. The result runs without Node or npm.
 * @param {RunnableOptions} opts
 * @returns {Promise<string>} path of the new executable
 */
async function assembleRunnable (opts) {
  const runtimeDir = path.dirname(opts.runtimeExe)
  const runtimeExeName = path.basename(opts.runtimeExe)
  await fs.mkdir(opts.targetDir, { recursive: true })

  for (const entry of await fs.readdir(runtimeDir, { withFileTypes: true })) {
    if (skipRuntimeEntry(entry.name, runtimeExeName)) continue
    await fs.cp(path.join(runtimeDir, entry.name), path.join(opts.targetDir, entry.name), { recursive: true })
  }

  const exePath = path.join(opts.targetDir, opts.exeName)
  await fs.copyFile(opts.runtimeExe, exePath)

  const appDir = path.join(opts.targetDir, 'resources', 'app')
  await fs.mkdir(appDir, { recursive: true })
  for (const name of APP_FILES) {
    const from = path.join(opts.sourceDir, name)
    if (await exists(from)) await fs.cp(from, path.join(appDir, name), { recursive: true })
  }

  return exePath
}

// resources holds Figmaify's own app.asar and helpers, none of which the new
// app needs. Installer leftovers and logs stay behind too.
/** @param {string} name @param {string} exeName */
function skipRuntimeEntry (name, exeName) {
  const lower = name.toLowerCase()
  return lower === 'resources' ||
    lower === exeName.toLowerCase() ||
    lower.startsWith('uninstall') ||
    lower.endsWith('.log')
}

/**
 * Sets the icon and version info on a Windows exe with rcedit.
 * @param {string} rceditPath
 * @param {string} exePath
 * @param {{ name: string, version: string, icon: string | null }} info
 */
function brandExe (rceditPath, exePath, info) {
  const args = [
    exePath,
    '--set-version-string', 'ProductName', info.name,
    '--set-version-string', 'FileDescription', info.name,
    '--set-version-string', 'InternalName', info.name,
    '--set-version-string', 'OriginalFilename', path.basename(exePath),
    '--set-version-string', 'CompanyName', '',
    '--set-version-string', 'LegalCopyright', '',
    '--set-file-version', info.version,
    '--set-product-version', info.version
  ]
  if (info.icon) args.push('--set-icon', info.icon)

  return new Promise((resolve, reject) => {
    execFile(rceditPath, args, { windowsHide: true }, (err, _stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()))
      else resolve(undefined)
    })
  })
}

/** @param {string} p */
async function exists (p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

module.exports = { assembleRunnable, brandExe, skipRuntimeEntry }
