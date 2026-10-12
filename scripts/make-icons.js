'use strict'

// Renders the SVG icons to the PNG and ICO files the app and the installer use.
// Run with `npm run icons` after changing build/icon.svg or src/template/icon.svg.

const fs = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const { pngsToIco } = require('../src/core/ico')

const ROOT = path.join(__dirname, '..')
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

function render (svgPath, size) {
  const svg = fs.readFileSync(svgPath)
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

function ico (svgPath) {
  return pngsToIco(ICO_SIZES.map((size) => ({ size, png: render(svgPath, size) })))
}

const appIcon = path.join(ROOT, 'build', 'icon.svg')
fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), render(appIcon, 512))
fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico(appIcon))
fs.writeFileSync(path.join(ROOT, 'src', 'renderer', 'icon.png'), render(appIcon, 64))

const defaultIcon = path.join(ROOT, 'src', 'template', 'icon.svg')
fs.writeFileSync(path.join(ROOT, 'src', 'template', 'icon.ico'), ico(defaultIcon))

console.log('Icons written.')
