'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { analyze, emit, linkedFrames } = require('./convert')
const { flatColor } = require('./convert/paint')
const { bundleGoogleFonts } = require('./fonts')
const { writeProject, TEMPLATE_DIR } = require('./project')
const { assembleRunnable, brandExe } = require('./runtime')
const { slugify, fileSafeName } = require('./names')

const MARKER = '.figmaify.json'
const STAGING = '.staging'
const OUTPUTS = ['source', 'app']
const DOWNLOADS_AT_ONCE = 6

/**
 * @typedef {object} BuildOptions
 * @property {string} fileKey
 * @property {string} fileName
 * @property {string | null} fileVersion
 * @property {string[]} screenIds frames the user picked
 * @property {string[]} frameIds every top level frame in the file
 * @property {string} startId
 * @property {string} appName
 * @property {string} appVersion
 * @property {boolean} frame false for a frameless window
 * @property {boolean} resizable
 * @property {boolean} bundleFonts
 * @property {Buffer | null} icon .ico file contents, null for the default icon
 * @property {string} outDir
 *
 * @typedef {object} BuildDeps
 * @property {ReturnType<typeof import('./figma-api').createClient>} client
 * @property {(url: string) => Promise<Buffer>} download
 * @property {(url: string, headers: Record<string, string>) => Promise<string | null>} fetchText
 * @property {(message: string) => void} log
 * @property {string | null} cacheDir
 * @property {string | null} runtimeExe the Electron binary to copy, null to skip the runnable copy
 * @property {string | null} rcedit
 * @property {string} electronVersion
 * @property {string} platform
 */

/**
 * Fetches the selected frames, converts them and writes the project plus a
 * runnable copy. Everything is built in a staging folder first, so a failed
 * build never leaves the previous one half deleted.
 * @param {BuildOptions} opts
 * @param {BuildDeps} deps
 */
async function build (opts, deps) {
  const slug = slugify(opts.appName)
  const root = path.join(opts.outDir, slug)
  const stage = path.join(root, STAGING)

  await claimOutput(root, opts)
  try {
    const result = await buildInto(stage, slug, opts, deps)
    await swapIn(root, stage, opts.appName)
    return {
      root,
      sourceDir: path.join(root, 'source'),
      appDir: result.exeName ? path.join(root, 'app') : null,
      exePath: result.exeName ? path.join(root, 'app', result.exeName) : null,
      screens: result.screens,
      warnings: result.warnings
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * @param {string} stage
 * @param {string} slug
 * @param {BuildOptions} opts
 * @param {BuildDeps} deps
 */
async function buildInto (stage, slug, opts, deps) {
  const { log } = deps
  /** @type {string[]} */
  const warnings = []

  const sourceDir = path.join(stage, 'source')
  const appDir = path.join(stage, 'app')
  const assetsDir = path.join(sourceDir, 'app', 'assets')
  const cache = await openCache(deps.cacheDir, opts.fileKey, opts.fileVersion)

  /** @param {string} rel @param {Buffer} data */
  const saveAsset = async (rel, data) => {
    const target = path.join(assetsDir, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
    return 'assets/' + rel.split(path.sep).join('/')
  }

  log('Getting the frames from Figma')
  const docs = await fetchScreens(opts, deps, cache, warnings)
  const screens = [...docs.values()]
  if (!screens.length) throw new Error('None of the selected frames came back from Figma.')
  const start = docs.get(opts.startId) || screens[0]

  const plan = analyze(screens)

  /** @type {Map<string, string>} */
  const renderFiles = new Map()
  for (const kind of /** @type {const} */ (['svg', 'png'])) {
    const items = plan.renders[kind]
    if (!items.length) continue
    log(`Rendering ${items.length} ${items.length === 1 ? 'layer' : 'layers'} as ${kind.toUpperCase()}`)

    /** @type {typeof items} */
    const missing = []
    for (const item of items) {
      const cached = cache && await cache.read(`renders/${item.cls}.${kind}`)
      if (cached) renderFiles.set(item.cls, await saveAsset(path.join('renders', `${item.cls}.${kind}`), cached))
      else missing.push(item)
    }
    if (!missing.length) continue

    const urls = await deps.client.renderNodes(opts.fileKey, missing.map((i) => i.id), { format: kind, scale: 2 })
    await pool(missing, DOWNLOADS_AT_ONCE, async (item) => {
      const url = urls[item.id]
      if (!url) return
      try {
        const data = await deps.download(url)
        renderFiles.set(item.cls, await saveAsset(path.join('renders', `${item.cls}.${kind}`), data))
        if (cache) await cache.write(`renders/${item.cls}.${kind}`, data)
      } catch (err) {
        warnings.push(`Couldn't download the render of ${item.id}: ${errorText(err)}`)
      }
    })
  }

  /** @type {Map<string, string>} */
  const imageFiles = new Map()
  if (plan.imageRefs.size) {
    const refs = [...plan.imageRefs]
    log(`Downloading ${refs.length} ${refs.length === 1 ? 'image' : 'images'}`)

    /** @type {string[]} */
    const missing = []
    for (const ref of refs) {
      const cached = cache && await cache.read(`images/${ref}`)
      if (cached) imageFiles.set(ref, await saveAsset(path.join('images', `${ref}.${imageExt(cached)}`), cached))
      else missing.push(ref)
    }

    if (missing.length) {
      const urls = await deps.client.getImageFills(opts.fileKey)
      await pool(missing, DOWNLOADS_AT_ONCE, async (ref) => {
        if (!urls[ref]) return
        try {
          const data = await deps.download(urls[ref])
          imageFiles.set(ref, await saveAsset(path.join('images', `${ref}.${imageExt(data)}`), data))
          if (cache) await cache.write(`images/${ref}`, data)
        } catch (err) {
          warnings.push(`Couldn't download an image fill: ${errorText(err)}`)
        }
      })
    }
  }

  log('Writing HTML and CSS')
  const out = emit({
    screens,
    imageUrl: (ref) => imageFiles.get(ref) || null,
    renderUrl: (cls) => renderFiles.get(cls) || null
  })
  warnings.push(...out.warnings)

  if (!opts.frame) {
    if (!out.windowButtons.has('close')) {
      warnings.push('The window has no frame and no layer is tagged @close, so it can only be closed with Alt+F4.')
    }
    if (!out.hasDrag) {
      warnings.push('The window has no frame and no layer is tagged @drag, so it can\'t be moved around.')
    }
  }

  let fontsCss = ''
  if (opts.bundleFonts && plan.fonts.length) {
    log('Bundling fonts from Google Fonts')
    try {
      const fonts = await bundleGoogleFonts(plan.fonts, {
        fetchText: deps.fetchText,
        download: deps.download,
        save: (name, data) => saveAsset(path.join('fonts', name), data)
      })
      fontsCss = fonts.css
      if (fonts.missing.length) {
        warnings.push(`Not on Google Fonts, these only show up on machines that have them installed: ${fonts.missing.join(', ')}.`)
      }
    } catch (err) {
      warnings.push(`Couldn't bundle fonts (${errorText(err)}), the app will use whatever fonts are installed.`)
    }
  }

  // Without an icon of its own the exe would keep Figmaify's.
  const icon = opts.icon || await fs.readFile(path.join(TEMPLATE_DIR, 'icon.ico'))
  await fs.mkdir(sourceDir, { recursive: true })
  await fs.writeFile(path.join(sourceDir, 'icon.ico'), icon)

  const box = start.absoluteBoundingBox
  log('Writing the project')
  await writeProject(sourceDir, {
    name: opts.appName,
    slug,
    version: opts.appVersion,
    appId: `com.figmaify.${slug}`,
    width: box.width,
    height: box.height,
    resizable: opts.resizable,
    frame: opts.frame,
    background: flatColor(start.fills) || '#ffffff',
    hasIcon: true,
    electronVersion: deps.electronVersion,
    startScreen: /** @type {string} */ (out.screenIds.get(start.id)),
    screensHtml: out.html,
    screensCss: out.css,
    fontsCss,
    figmaFile: { key: opts.fileKey, name: opts.fileName }
  })

  let exeName = null
  if (deps.runtimeExe) {
    log('Packing the runnable app')
    exeName = fileSafeName(opts.appName) + (deps.platform === 'win32' ? '.exe' : '')
    const exePath = await assembleRunnable({ runtimeExe: deps.runtimeExe, sourceDir, targetDir: appDir, exeName })

    if (deps.platform === 'win32' && deps.rcedit) {
      try {
        await brandExe(deps.rcedit, exePath, {
          name: opts.appName,
          version: opts.appVersion,
          icon: path.join(sourceDir, 'icon.ico')
        })
      } catch (err) {
        warnings.push(`Couldn't set the exe icon and details: ${errorText(err)}`)
      }
    }
  }

  return { exeName, screens: screens.length, warnings }
}

/**
 * Pulls the selected frames, then follows prototype links to frames that
 * weren't picked so buttons don't lead nowhere.
 * @param {BuildOptions} opts
 * @param {BuildDeps} deps
 * @param {Cache | null} cache
 * @param {string[]} warnings
 */
async function fetchScreens (opts, deps, cache, warnings) {
  const known = new Set(opts.frameIds)
  /** @type {Map<string, any>} */
  const docs = new Map()
  let want = [...new Set(opts.screenIds)]

  for (let round = 0; want.length && round < 4; round++) {
    const fetched = await fetchNodes(opts.fileKey, want, deps, cache)
    /** @type {Set<string>} */
    const linked = new Set()
    for (const id of want) {
      const doc = fetched.get(id)
      if (!doc) {
        warnings.push(`Frame ${id} wasn't found in the file anymore.`)
        continue
      }
      docs.set(id, doc)
      for (const target of linkedFrames(doc)) {
        if (known.has(target) && !docs.has(target) && !want.includes(target)) linked.add(target)
      }
    }
    if (linked.size) {
      deps.log(`Adding ${linked.size} linked ${linked.size === 1 ? 'frame' : 'frames'} the prototype points to`)
    }
    want = [...linked]
  }
  return docs
}

/**
 * @param {string} fileKey
 * @param {string[]} ids
 * @param {BuildDeps} deps
 * @param {Cache | null} cache
 */
async function fetchNodes (fileKey, ids, deps, cache) {
  /** @type {Map<string, any>} */
  const out = new Map()
  /** @type {string[]} */
  const missing = []

  for (const id of ids) {
    const cached = cache && await cache.read(`nodes/${safeName(id)}.json`)
    if (cached) out.set(id, JSON.parse(cached.toString('utf8')))
    else missing.push(id)
  }

  if (missing.length) {
    const body = await deps.client.getNodes(fileKey, missing)
    for (const id of missing) {
      const entry = body.nodes && body.nodes[id]
      if (!entry || !entry.document) continue
      out.set(id, entry.document)
      if (cache) await cache.write(`nodes/${safeName(id)}.json`, Buffer.from(JSON.stringify(entry.document)))
    }
  }
  return out
}

/**
 * Builds replace what's in the output folder, so only touch folders
 * Figmaify made itself, and mark new ones as ours right away.
 * @param {string} root
 * @param {BuildOptions} opts
 */
async function claimOutput (root, opts) {
  let entries = null
  try {
    entries = await fs.readdir(root)
  } catch {}

  if (entries && entries.length && !entries.includes(MARKER)) {
    throw new Error(`${root} already exists and wasn't made by Figmaify. Pick another output folder or app name.`)
  }

  await fs.mkdir(root, { recursive: true })
  await fs.rm(path.join(root, STAGING), { recursive: true, force: true })
  await fs.writeFile(path.join(root, MARKER), JSON.stringify({
    generator: 'figmaify',
    fileKey: opts.fileKey,
    fileVersion: opts.fileVersion,
    builtAt: new Date().toISOString()
  }, null, 2) + '\n')
}

/**
 * Moves the new build into place. The old folders are renamed out of the
 * way first, which Windows refuses outright while the old app is running,
 * instead of deleting half of it.
 * @param {string} root
 * @param {string} stage
 * @param {string} appName
 */
async function swapIn (root, stage, appName) {
  /** @type {string[]} */
  const moved = []
  try {
    for (const name of OUTPUTS) {
      const current = path.join(root, name)
      if (!(await exists(current))) continue
      await fs.rename(current, path.join(stage, 'old-' + name))
      moved.push(name)
    }
  } catch (err) {
    for (const name of moved) {
      await fs.rename(path.join(stage, 'old-' + name), path.join(root, name)).catch(() => {})
    }
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new Error(`Close "${appName}" and anything else using its folder, Windows won't let the old build be replaced while it's open.`)
    }
    throw err
  }

  for (const name of OUTPUTS) {
    const fresh = path.join(stage, name)
    if (await exists(fresh)) await fs.rename(fresh, path.join(root, name))
  }
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

/**
 * @typedef {{ read: (rel: string) => Promise<Buffer | null>, write: (rel: string, data: Buffer) => Promise<void> }} Cache
 */

/**
 * Renders and node trees are cached per file version, which matters because
 * Figma's API budget is tight on some seats.
 * @param {string | null} dir
 * @param {string} fileKey
 * @param {string | null} version
 * @returns {Promise<Cache | null>}
 */
async function openCache (dir, fileKey, version) {
  if (!dir || !version) return null
  const fileDir = path.join(dir, safeName(fileKey))
  const base = path.join(fileDir, safeName(version))

  // Older versions of the same file are dead weight.
  try {
    for (const name of await fs.readdir(fileDir)) {
      if (name !== safeName(version)) await fs.rm(path.join(fileDir, name), { recursive: true, force: true })
    }
  } catch {}

  return {
    async read (rel) {
      try {
        return await fs.readFile(path.join(base, rel))
      } catch {
        return null
      }
    },
    async write (rel, data) {
      try {
        const target = path.join(base, rel)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, data)
      } catch {}
    }
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 */
async function pool (items, limit, fn) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  })
  await Promise.all(workers)
}

/** @param {Buffer} buf */
function imageExt (buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'gif'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  if (/^\s*(<\?xml|<svg)/.test(buf.subarray(0, 200).toString('utf8'))) return 'svg'
  return 'png'
}

/** @param {string} value */
function safeName (value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-')
}

/** @param {unknown} err */
function errorText (err) {
  return err instanceof Error ? err.message : String(err)
}

module.exports = { build, imageExt, MARKER }
