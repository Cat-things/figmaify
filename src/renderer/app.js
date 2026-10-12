'use strict'

/** @type {any} */
const api = /** @type {any} */ (window).figmaify

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id)

const state = {
  /** @type {any} */
  outline: null,
  /** @type {string | null} */
  pageId: null,
  /** @type {string | null} */
  focus: null,
  /** @type {Set<string>} */
  selected: new Set(),
  /** @type {string | null} */
  startId: null,
  nameTouched: false,
  hasToken: false,
  building: false
}

init()

async function init () {
  const res = await api.getState()
  if (!res.ok) return

  showToken(res.token)
  $('url').value = res.prefs.lastUrl || ''
  setOutDir(res.prefs.outDir)
  $('fonts').checked = res.prefs.bundleFonts
  $('resizable').checked = res.prefs.resizable
  for (const radio of frameRadios()) radio.checked = (radio.value === 'standard') === res.prefs.frame

  api.onLog((/** @type {string} */ message) => log(message))
  wire()
  refresh()
}

function wire () {
  $('token-form').addEventListener('submit', async (/** @type {Event} */ event) => {
    event.preventDefault()
    const res = await api.setToken($('token').value)
    if (!res.ok) return showError('token-error', res.error)
    $('token').value = ''
    showToken(res.token)
    refresh()
  })

  $('token-change').addEventListener('click', () => {
    $('token-block').hidden = false
    $('token-cancel').hidden = false
    $('token').focus()
  })

  $('token-cancel').addEventListener('click', () => {
    $('token-block').hidden = true
    showError('token-error', null)
  })

  $('file-form').addEventListener('submit', (/** @type {Event} */ event) => {
    event.preventDefault()
    loadFile()
  })

  $('page').addEventListener('change', () => {
    state.pageId = $('page').value
    renderFrames()
  })

  $('frames').addEventListener('change', (/** @type {Event} */ event) => {
    const box = /** @type {HTMLInputElement} */ (event.target)
    if (!box.dataset.id) return
    if (box.checked) state.selected.add(box.dataset.id)
    else state.selected.delete(box.dataset.id)
    renderStart()
    refresh()
  })

  $('select-all').addEventListener('click', () => {
    for (const frame of currentPage().frames) state.selected.add(frame.id)
    renderFrames()
  })

  $('select-none').addEventListener('click', () => {
    state.selected.clear()
    renderFrames()
  })

  $('start').addEventListener('change', () => {
    state.startId = $('start').value
  })

  $('name').addEventListener('input', () => {
    state.nameTouched = true
    refresh()
  })

  for (const input of document.querySelectorAll('input[name="frame"], #resizable, #fonts')) {
    input.addEventListener('change', () => api.setPrefs(prefsFromForm()))
  }

  $('icon-pick').addEventListener('click', async () => {
    const res = await api.chooseIcon()
    if (!res.ok) return log(res.error, 'error')
    if (!res.icon) return
    $('icon-name').textContent = res.icon.name
    $('icon-preview').hidden = !res.icon.preview
    if (res.icon.preview) $('icon-preview').src = res.icon.preview
    $('icon-clear').hidden = false
  })

  $('icon-clear').addEventListener('click', async () => {
    await api.clearIcon()
    $('icon-name').textContent = 'Default icon'
    $('icon-preview').hidden = true
    $('icon-clear').hidden = true
  })

  $('out-pick').addEventListener('click', async () => {
    const res = await api.chooseFolder()
    if (res.ok && res.path) setOutDir(res.path)
  })

  $('build').addEventListener('click', buildApp)

  $('run').addEventListener('click', async () => {
    const res = await api.runApp()
    if (!res.ok) log(res.error, 'error')
  })

  $('open').addEventListener('click', async () => {
    const res = await api.openOutput()
    if (!res.ok) log(res.error, 'error')
  })

  for (const link of document.querySelectorAll('[data-help]')) {
    link.addEventListener('click', () => api.help(/** @type {HTMLElement} */ (link).dataset.help))
  }
}

/** @param {'saved' | 'session' | null} storage */
function showToken (storage) {
  state.hasToken = !!storage
  $('token-block').hidden = !!storage
  $('token-state').hidden = !storage
  $('token-cancel').hidden = true
  $('token-label').textContent = storage === 'session'
    ? 'Figma token set for this session'
    : 'Figma token saved'
  showError('token-error', null)
}

async function loadFile () {
  const url = $('url').value.trim()
  if (!url) return
  showError('file-error', null)
  $('load').disabled = true
  $('file-info').textContent = 'Loading...'

  const res = await api.loadFile(url)
  $('load').disabled = false
  if (!res.ok) {
    $('file-info').textContent = ''
    showError('file-error', res.error)
    return
  }
  setOutline(res.outline, res.focus)
}

/** @param {any} outline @param {string | null} focus */
function setOutline (outline, focus) {
  state.outline = outline
  state.focus = focus

  const pages = outline.pages.filter((/** @type {any} */ p) => p.frames.length)
  const pageOf = (/** @type {string | null} */ id) => id && pages.find((/** @type {any} */ p) => p.frames.some((/** @type {any} */ f) => f.id === id))
  const page = pageOf(focus) || pageOf(outline.starts[0]) || pages[0]
  state.pageId = page.id

  // Picking every frame on the page up front keeps it to one API call,
  // instead of fetching linked frames one round at a time later.
  state.selected = new Set(page.frames.map((/** @type {any} */ f) => f.id))
  const startCandidates = [focus, ...outline.starts].filter((id) => id && state.selected.has(id))
  state.startId = startCandidates[0] || page.frames[0].id

  if (!state.nameTouched) $('name').value = outline.name

  const frameCount = pages.reduce((/** @type {number} */ n, /** @type {any} */ p) => n + p.frames.length, 0)
  const parts = [outline.name, `${frameCount} ${frameCount === 1 ? 'frame' : 'frames'}`]
  if (outline.lastModified) parts.push('edited ' + ago(outline.lastModified))
  $('file-info').textContent = parts.join(', ')

  const select = $('page')
  select.replaceChildren(...pages.map((/** @type {any} */ p) => new Option(p.name, p.id, false, p.id === state.pageId)))
  select.disabled = pages.length < 2

  renderFrames()
}

function currentPage () {
  return state.outline.pages.find((/** @type {any} */ p) => p.id === state.pageId)
}

function renderFrames () {
  const list = $('frames')
  const page = currentPage()

  list.replaceChildren(...page.frames.map((/** @type {any} */ frame) => {
    const row = document.createElement('label')
    row.className = 'frame-row' + (frame.id === state.focus ? ' focus' : '')

    const box = document.createElement('input')
    box.type = 'checkbox'
    box.dataset.id = frame.id
    box.checked = state.selected.has(frame.id)

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = frame.name
    name.title = frame.name

    row.append(box, name)
    if (frame.section) {
      const section = document.createElement('span')
      section.className = 'section'
      section.textContent = frame.section
      row.append(section)
    }

    const size = document.createElement('span')
    size.className = 'size'
    size.textContent = `${frame.width} × ${frame.height}`
    row.append(size)
    return row
  }))

  $('select-all').disabled = false
  $('select-none').disabled = false
  renderStart()
  refresh()
}

function renderStart () {
  const frames = state.outline.pages.flatMap((/** @type {any} */ p) => p.frames)
  const picked = frames.filter((/** @type {any} */ f) => state.selected.has(f.id))
  if (!picked.some((/** @type {any} */ f) => f.id === state.startId)) {
    state.startId = picked.length ? picked[0].id : null
  }
  const select = $('start')
  select.replaceChildren(...picked.map((/** @type {any} */ f) => new Option(f.name, f.id, false, f.id === state.startId)))
  select.disabled = !picked.length
}

function refresh () {
  const count = state.selected.size
  $('count').textContent = state.outline ? `${count} selected` : ''

  let note = ''
  if (!state.hasToken) note = 'Add a Figma token first.'
  else if (!state.outline) note = 'Load a Figma file to start.'
  else if (!count) note = 'Pick at least one frame.'
  else if (!$('name').value.trim()) note = 'Give the app a name.'

  $('build-note').textContent = state.building ? 'Building...' : note
  $('build').disabled = state.building || !!note
}

function frameRadios () {
  return [.../** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="frame"]'))]
}

function prefsFromForm () {
  return {
    frame: frameRadios().some((radio) => radio.checked && radio.value === 'standard'),
    resizable: $('resizable').checked,
    bundleFonts: $('fonts').checked
  }
}

async function buildApp () {
  state.building = true
  $('log').replaceChildren()
  $('done').hidden = true
  refresh()

  const prefs = prefsFromForm()
  const res = await api.build({
    screenIds: [...state.selected],
    startId: state.startId,
    appName: $('name').value.trim(),
    appVersion: $('version').value.trim(),
    frame: prefs.frame,
    resizable: prefs.resizable,
    bundleFonts: prefs.bundleFonts
  })

  state.building = false
  refresh()

  if (!res.ok) return log(res.error, 'error')
  if (res.cancelled) return log('Cancelled.')

  const result = res.result
  for (const warning of result.warnings) log(warning, 'warn')
  log(`Done. ${result.screens} ${result.screens === 1 ? 'screen' : 'screens'} built into ${result.root}`, 'ok')
  if (!result.exePath) log('The runnable copy is only made on Windows for now, the source project is ready though.')
  $('run').hidden = !result.exePath
  $('done').hidden = false
  scrollLog()
}

/** @param {string} message @param {string} [kind] */
function log (message, kind) {
  const item = document.createElement('li')
  item.textContent = message
  if (kind) item.className = kind
  $('log').append(item)
  scrollLog()
}

function scrollLog () {
  $('log').scrollTop = $('log').scrollHeight
}

/** @param {string} id @param {string | null} message */
function showError (id, message) {
  $(id).hidden = !message
  $(id).textContent = message || ''
}

/** @param {string} dir */
function setOutDir (dir) {
  $('out-dir').textContent = dir
  $('out-dir').title = dir
}

/** @param {string} iso */
function ago (iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  /** @type {Array<[Intl.RelativeTimeFormatUnit, number]>} */
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
