'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { build } = require('../src/core/build')
const { outlineOf } = require('../src/core/outline')
const { file, nodes } = require('./fixtures/sample-file')

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a3b20000000049454e44ae426082', 'hex')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')

function tmp () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'figmaify-test-'))
}

// Looks enough like an Electron install for the copy step.
function fakeRuntime () {
  const dir = tmp()
  const write = (rel, content = 'x') => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
  write('Figmaify.exe', 'runtime')
  write('ffmpeg.dll')
  write('resources.pak')
  write('locales/en-US.pak')
  write('resources/app.asar')
  write('Uninstall Figmaify.exe')
  write('debug.log')
  return path.join(dir, 'Figmaify.exe')
}

function mockDeps (extra = {}) {
  const calls = []
  const client = {
    async getNodes (_key, ids) {
      calls.push(['nodes', ids])
      return { nodes: Object.fromEntries(ids.map((id) => [id, nodes[id] ? { document: nodes[id] } : null])) }
    },
    async renderNodes (_key, ids, opts) {
      calls.push(['render', opts.format, ids])
      return Object.fromEntries(ids.map((id) => [id, `mock://${opts.format}/${id}`]))
    },
    async getImageFills () {
      calls.push(['fills'])
      return { 'hero-ref': 'mock://img/hero', 'avatar-ref': 'mock://img/avatar' }
    }
  }
  return {
    calls,
    deps: {
      client: /** @type {any} */ (client),
      download: async (/** @type {string} */ url) => url.startsWith('mock://svg/') ? SVG : PNG,
      fetchText: async () => null,
      log: () => {},
      cacheDir: null,
      runtimeExe: null,
      rcedit: null,
      electronVersion: '44.7.0',
      platform: 'win32',
      ...extra
    }
  }
}

function options (outDir, overrides = {}) {
  const outline = outlineOf(file)
  return {
    fileKey: 'KEY',
    fileName: outline.name,
    fileVersion: outline.version,
    screenIds: ['1:2'],
    frameIds: outline.pages.flatMap((p) => p.frames.map((f) => f.id)),
    startId: '1:2',
    appName: 'Sample App',
    appVersion: '1.2.3',
    frame: true,
    resizable: true,
    bundleFonts: false,
    icon: null,
    outDir,
    ...overrides
  }
}

test('builds the source project and a runnable copy', async () => {
  const out = tmp()
  const runtimeExe = fakeRuntime()
  const { deps } = mockDeps({ runtimeExe })
  const result = await build(options(out), deps)

  assert.equal(result.screens, 3, 'linked frames are pulled in')
  const src = path.join(out, 'sample-app', 'source')
  for (const rel of ['package.json', 'main.js', 'preload.js', 'app.config.json', 'icon.ico', 'app/index.html', 'app/app.js', 'app/base.css', 'app/screens.css', 'app/assets/renders/n1-6.svg', 'app/assets/images/hero-ref.png']) {
    assert.ok(fs.existsSync(path.join(src, rel)), rel)
  }

  const config = JSON.parse(fs.readFileSync(path.join(src, 'app.config.json'), 'utf8'))
  assert.deepEqual(config, {
    name: 'Sample App',
    appId: 'com.figmaify.sample-app',
    width: 1200,
    height: 760,
    resizable: true,
    frame: true,
    background: '#f4f5f7',
    icon: 'icon.ico'
  })
  const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '1.2.3')
  assert.equal(pkg.devDependencies.electron, '^44.7.0')

  const app = path.join(out, 'sample-app', 'app')
  assert.equal(result.exePath, path.join(app, 'Sample App.exe'))
  assert.equal(fs.readFileSync(result.exePath, 'utf8'), 'runtime')
  assert.ok(fs.existsSync(path.join(app, 'ffmpeg.dll')))
  assert.ok(fs.existsSync(path.join(app, 'locales', 'en-US.pak')))
  assert.ok(fs.existsSync(path.join(app, 'resources', 'app', 'app', 'index.html')))
  assert.ok(!fs.existsSync(path.join(app, 'resources', 'app.asar')), 'our own app.asar stays behind')
  assert.ok(!fs.existsSync(path.join(app, 'Figmaify.exe')))
  assert.ok(!fs.existsSync(path.join(app, 'Uninstall Figmaify.exe')))
  assert.ok(!fs.existsSync(path.join(app, 'debug.log')))
  assert.ok(!fs.existsSync(path.join(app, 'resources', 'app', 'README.md')))
})

test('rebuilding replaces the old output and reuses the cache', async () => {
  const out = tmp()
  const cacheDir = tmp()

  const first = mockDeps({ cacheDir })
  await build(options(out), first.deps)
  fs.writeFileSync(path.join(out, 'sample-app', 'source', 'stale.txt'), 'old')

  const second = mockDeps({ cacheDir })
  await build(options(out), second.deps)

  assert.ok(!fs.existsSync(path.join(out, 'sample-app', 'source', 'stale.txt')))
  assert.deepEqual(second.calls, [], 'nothing is fetched again for the same file version')
})

test('refuses to wipe a folder it did not make', async () => {
  const out = tmp()
  fs.mkdirSync(path.join(out, 'sample-app'))
  fs.writeFileSync(path.join(out, 'sample-app', 'notes.txt'), 'mine')

  const { deps } = mockDeps()
  await assert.rejects(build(options(out), deps), /wasn't made by Figmaify/)
  assert.ok(fs.existsSync(path.join(out, 'sample-app', 'notes.txt')))
})

test('frameless windows without controls get a warning', async () => {
  const { deps } = mockDeps()
  const result = await build(options(tmp(), { frame: false, screenIds: ['2:1'], startId: '2:1' }), deps)
  assert.ok(result.warnings.some((w) => w.includes('@close')))
  assert.ok(result.warnings.some((w) => w.includes('@drag')))
})

test('a failed build leaves the previous one alone', async () => {
  const out = tmp()
  await build(options(out), mockDeps().deps)
  const index = path.join(out, 'sample-app', 'source', 'app', 'index.html')
  const before = fs.readFileSync(index, 'utf8')

  const { deps } = mockDeps()
  deps.client.renderNodes = async () => { throw new Error('rate limited') }
  await assert.rejects(build(options(out), deps), /rate limited/)

  assert.equal(fs.readFileSync(index, 'utf8'), before)
  assert.ok(!fs.existsSync(path.join(out, 'sample-app', '.staging')))
})
