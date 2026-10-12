'use strict'

const { slugify } = require('./names')

const CSS_API = 'https://fonts.googleapis.com/css2'

// Google serves woff2 to current Chrome. The exact version doesn't matter much.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/**
 * @typedef {{ family: string, weight: number, italic: boolean }} Face
 * @typedef {{
 *   fetchText: (url: string, headers: Record<string, string>) => Promise<string | null>,
 *   download: (url: string) => Promise<Buffer>,
 *   save: (fileName: string, data: Buffer) => Promise<string>
 * }} FontIO
 */

/**
 * Pulls the fonts a design uses from Google Fonts so the app looks right on
 * machines that don't have them installed. Families Google doesn't have are
 * reported back and left to the system.
 * @param {Face[]} faces
 * @param {FontIO} io
 */
async function bundleGoogleFonts (faces, io) {
  /** @type {Map<string, Set<string>>} */
  const families = new Map()
  for (const f of faces) {
    const weight = Math.min(1000, Math.max(1, Math.round(f.weight || 400)))
    const key = `${f.italic ? 1 : 0},${weight}`
    let variants = families.get(f.family)
    if (!variants) families.set(f.family, (variants = new Set()))
    variants.add(key)
  }

  /** @type {string[]} */
  const blocks = []
  /** @type {string[]} */
  const bundled = []
  /** @type {string[]} */
  const missing = []
  /** @type {Map<string, string>} */
  const saved = new Map()
  let count = 0

  for (const [family, variants] of families) {
    const sorted = [...variants].sort(compareVariants)
    let css = await io.fetchText(cssUrl(family, sorted), { 'User-Agent': BROWSER_UA })

    // One weight Google doesn't have fails the whole request, so retry them one by one.
    if (!css && sorted.length > 1) {
      const parts = []
      for (const v of sorted) {
        const one = await io.fetchText(cssUrl(family, [v]), { 'User-Agent': BROWSER_UA })
        if (one) parts.push(one)
      }
      css = parts.length ? parts.join('\n') : null
    }

    if (!css || !css.includes('@font-face')) {
      missing.push(family)
      continue
    }

    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g)].map((m) => m[1]))]
    for (const url of urls) {
      if (!saved.has(url)) {
        const ext = (url.match(/\.(woff2|woff|ttf|otf)(?:$|\?)/) || [])[1] || 'woff2'
        const local = await io.save(`${slugify(family)}-${count++}.${ext}`, await io.download(url))
        saved.set(url, local)
      }
      css = css.split(`url(${url})`).join(`url("${saved.get(url)}")`)
    }

    blocks.push(`/* ${family} */\n${css.trim()}`)
    bundled.push(family)
  }

  return { css: blocks.join('\n\n') + (blocks.length ? '\n' : ''), bundled, missing }
}

/** @param {string} family @param {string[]} variants */
function cssUrl (family, variants) {
  const name = encodeURIComponent(family).replace(/%20/g, '+')
  return `${CSS_API}?family=${name}:ital,wght@${variants.join(';')}&display=swap`
}

/** @param {string} a @param {string} b */
function compareVariants (a, b) {
  const [ai, aw] = a.split(',').map(Number)
  const [bi, bw] = b.split(',').map(Number)
  return ai - bi || aw - bw
}

module.exports = { bundleGoogleFonts, cssUrl }
