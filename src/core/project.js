'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { escapeHtml } = require('./convert/units')

const TEMPLATE_DIR = path.join(__dirname, '..', 'template')

// What goes into resources/app of the runnable copy.
const APP_FILES = ['package.json', 'app.config.json', 'main.js', 'preload.js', 'app', 'icon.ico']

/**
 * @typedef {{
 *   name: string,
 *   slug: string,
 *   version: string,
 *   appId: string,
 *   width: number,
 *   height: number,
 *   resizable: boolean,
 *   frame: boolean,
 *   background: string,
 *   hasIcon: boolean,
 *   electronVersion: string,
 *   startScreen: string,
 *   screensHtml: string,
 *   screensCss: string,
 *   fontsCss: string,
 *   figmaFile: { key: string, name: string }
 * }} ProjectSpec
 */

/**
 * Writes the generated Electron project. Assets are already in app/assets
 * by the time this runs.
 * @param {string} dir
 * @param {ProjectSpec} spec
 */
async function writeProject (dir, spec) {
  await fs.mkdir(path.join(dir, 'app'), { recursive: true })

  const config = {
    name: spec.name,
    appId: spec.appId,
    width: Math.round(spec.width),
    height: Math.round(spec.height),
    resizable: spec.resizable,
    frame: spec.frame,
    background: spec.background,
    icon: spec.hasIcon ? 'icon.ico' : null
  }

  const pkg = {
    name: spec.slug,
    productName: spec.name,
    version: spec.version,
    description: `${spec.name}, converted from Figma with Figmaify`,
    main: 'main.js',
    private: true,
    scripts: {
      start: 'electron .',
      dist: 'electron-builder --win'
    },
    devDependencies: {
      electron: `^${spec.electronVersion}`,
      'electron-builder': '^26.0.0'
    },
    build: {
      appId: spec.appId,
      productName: spec.name,
      files: ['main.js', 'preload.js', 'app.config.json', 'app/**/*'].concat(spec.hasIcon ? ['icon.ico'] : []),
      win: Object.assign({ target: ['nsis'] }, spec.hasIcon ? { icon: 'icon.ico' } : {})
    }
  }

  await Promise.all([
    write(dir, 'package.json', JSON.stringify(pkg, null, 2) + '\n'),
    write(dir, 'app.config.json', JSON.stringify(config, null, 2) + '\n'),
    copyTemplate('main.js', dir),
    copyTemplate('preload.js', dir),
    copyTemplate('app/app.js', dir),
    copyTemplate('app/base.css', dir),
    write(dir, 'app/index.html', indexHtml(spec)),
    write(dir, 'app/screens.css', spec.screensCss),
    write(dir, 'app/fonts.css', spec.fontsCss || '/* No bundled fonts. */\n'),
    write(dir, 'README.md', readme(spec)),
    write(dir, '.gitignore', 'node_modules/\ndist/\n')
  ])
}

/** @param {ProjectSpec} spec */
function indexHtml (spec) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'">
<title>${escapeHtml(spec.name)}</title>
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="screens.css">
<script src="app.js" defer></script>
</head>
<body data-start="${escapeHtml(spec.startScreen)}">
${spec.screensHtml}
</body>
</html>
`
}

/** @param {ProjectSpec} spec */
function readme (spec) {
  return `# ${spec.name}

Converted from the Figma file "${spec.figmaFile.name}" with Figmaify.

## Running it

The \`app\` folder next to this one already has a runnable copy, just open the exe in there.

To run from this folder instead:

\`\`\`
npm install
npm start
\`\`\`

## Making an installer

\`\`\`
npm install
npm run dist
\`\`\`

The installer ends up in \`dist\`.

## Layout

- \`main.js\` creates the window. Size, frame and icon come from \`app.config.json\`.
- \`preload.js\` gives the page the window buttons (close, minimize, maximize).
- \`app/index.html\` has one \`<section>\` per Figma frame.
- \`app/screens.css\` holds the styles for every layer, one class per layer.
- \`app/app.js\` switches screens and runs the prototype actions.

Clickable layers keep their actions in a \`data-act\` attribute, for example:

\`\`\`html
<div class="n12-34 hot" data-act='[{"do":"go","to":"s-5-6"}]'>
\`\`\`

Hook your own code into \`app/app.js\` or replace a screen's markup by hand.
Rebuilding from Figma overwrites this folder, so keep a copy of anything you change.
`
}

/** @param {string} dir @param {string} file @param {string} content */
async function write (dir, file, content) {
  const target = path.join(dir, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

/** @param {string} file @param {string} dir */
async function copyTemplate (file, dir) {
  await write(dir, file, await fs.readFile(path.join(TEMPLATE_DIR, file), 'utf8'))
}

module.exports = { writeProject, indexHtml, APP_FILES, TEMPLATE_DIR }
