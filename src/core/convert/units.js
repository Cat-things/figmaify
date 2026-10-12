'use strict'

/** @param {number} n @param {number} [digits] */
function round (n, digits = 2) {
  const f = 10 ** digits
  const out = Math.round(n * f) / f
  return Object.is(out, -0) ? 0 : out
}

/** @param {number} n */
function px (n) {
  const v = round(n)
  return v === 0 ? '0' : v + 'px'
}

/** @param {number} ratio 0..1 */
function pct (ratio) {
  const v = round(ratio * 100, 3)
  return v === 0 ? '0' : v + '%'
}

/** @param {{ r: number, g: number, b: number, a?: number }} c @param {number} [opacity] */
function color (c, opacity = 1) {
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const a = round((c.a === undefined ? 1 : c.a) * opacity, 3)
  if (a >= 1) return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** @param {string} id */
function idToClass (id) {
  return 'n' + String(id).replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')
}

/** @param {string} text */
function escapeHtml (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** @param {string} text */
function cssString (text) {
  return '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"'
}

module.exports = { round, px, pct, color, idToClass, escapeHtml, cssString }
