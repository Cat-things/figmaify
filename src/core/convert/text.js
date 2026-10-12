'use strict'

const { px, round, escapeHtml, cssString } = require('./units')
const { visiblePaints, flatColor, linearGradient, radialGradient } = require('./paint')

/** @typedef {[string, string]} Decl */

const FALLBACK_FONTS = '"Segoe UI", system-ui, sans-serif'

const CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }
const ALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }
const V_ALIGN = { TOP: 'flex-start', CENTER: 'center', BOTTOM: 'flex-end' }

/**
 * Font and color declarations for a full type style or a partial override.
 * @param {any} style
 * @param {any[] | undefined} fills
 * @param {{ w: number, h: number }} size
 * @returns {Decl[]}
 */
function typeDecls (style, fills, size) {
  /** @type {Decl[]} */
  const out = []
  if (!style) style = {}

  if (style.fontFamily) out.push(['font-family', `${cssString(style.fontFamily)}, ${FALLBACK_FONTS}`])
  if (style.fontSize) out.push(['font-size', px(style.fontSize)])
  if (style.fontWeight) out.push(['font-weight', String(style.fontWeight)])
  if (style.italic !== undefined) out.push(['font-style', style.italic ? 'italic' : 'normal'])

  if (style.lineHeightUnit === 'PIXELS' && style.lineHeightPx) {
    out.push(['line-height', px(style.lineHeightPx)])
  } else if (style.lineHeightUnit === 'FONT_SIZE_%' && style.lineHeightPercentFontSize) {
    out.push(['line-height', String(round(style.lineHeightPercentFontSize / 100, 3))])
  } else if (style.lineHeightUnit === 'INTRINSIC_%') {
    out.push(['line-height', 'normal'])
  }

  if (style.letterSpacing) out.push(['letter-spacing', px(style.letterSpacing)])

  if (style.textCase === 'SMALL_CAPS' || style.textCase === 'SMALL_CAPS_FORCED') {
    out.push(['font-variant-caps', 'small-caps'])
  } else if (style.textCase && style.textCase in CASE) {
    out.push(['text-transform', /** @type {Record<string, string>} */ (CASE)[style.textCase]])
  } else if (style.textCase === 'ORIGINAL') {
    out.push(['text-transform', 'none'])
  }

  if (style.textDecoration === 'UNDERLINE') out.push(['text-decoration', 'underline'])
  else if (style.textDecoration === 'STRIKETHROUGH') out.push(['text-decoration', 'line-through'])
  else if (style.textDecoration === 'NONE') out.push(['text-decoration', 'none'])

  if (fills) out.push(...textFill(fills, size))
  return out
}

/**
 * @param {any[]} fills
 * @param {{ w: number, h: number }} size
 * @returns {Decl[]}
 */
function textFill (fills, size) {
  const paints = visiblePaints(fills)
  const top = paints[paints.length - 1]
  if (!top) return [['color', 'transparent']]

  if (top.type === 'GRADIENT_LINEAR' || top.type === 'GRADIENT_RADIAL' || top.type === 'GRADIENT_DIAMOND') {
    const g = top.type === 'GRADIENT_LINEAR' ? linearGradient(top, size) : radialGradient(top, size)
    if (g) {
      return [
        ['background', g],
        ['-webkit-background-clip', 'text'],
        ['background-clip', 'text'],
        ['color', 'transparent']
      ]
    }
  }
  const c = flatColor(fills)
  return c ? [['color', c]] : []
}

/**
 * Declarations for the text box itself (alignment, wrapping, truncation).
 * @param {any} node
 * @returns {{ box: Decl[], para: Decl[] }}
 */
function textLayout (node) {
  const style = node.style || {}
  /** @type {Decl[]} */
  const box = [['display', 'flex'], ['flex-direction', 'column']]
  const v = /** @type {Record<string, string>} */ (V_ALIGN)[style.textAlignVertical]
  if (v && v !== 'flex-start') box.push(['justify-content', v])

  /** @type {Decl[]} */
  const para = []
  const align = /** @type {Record<string, string>} */ (ALIGN)[style.textAlignHorizontal]
  if (align && align !== 'left') para.push(['text-align', align])

  const lines = style.textTruncation === 'ENDING' ? (style.maxLines || node.maxLines || 1) : 0
  const oneLine = style.textAutoResize === 'WIDTH_AND_HEIGHT' || lines === 1
  para.push(['white-space', oneLine ? 'pre' : 'pre-wrap'])

  if (lines > 1) {
    para.push(['display', '-webkit-box'], ['-webkit-line-clamp', String(lines)], ['-webkit-box-orient', 'vertical'], ['overflow', 'hidden'])
  } else if (lines === 1) {
    para.push(['overflow', 'hidden'], ['text-overflow', 'ellipsis'])
  }
  if (lines) box.push(['overflow', 'hidden'])

  return { box, para }
}

/**
 * Splits the characters into styled runs and returns the inner HTML.
 * Overrides become spans with their own classes, written to `rules`.
 * @param {any} node
 * @param {string} cls
 * @param {{ w: number, h: number }} size
 * @param {(selector: string, decls: Decl[]) => void} addRule
 * @param {(hyperlink: any) => any[] | null} linkActions
 */
function textContent (node, cls, size, addRule, linkActions) {
  const chars = String(node.characters || '').replace(/\u2028/g, '\n')
  const overrides = node.characterStyleOverrides || []
  const table = node.styleOverrideTable || {}
  const lineTypes = node.lineTypes || []

  /** @type {Set<string>} */
  const usedOverrides = new Set()

  /** @param {number} from @param {number} to */
  const runs = (from, to) => {
    let html = ''
    let i = from
    while (i < to) {
      const id = overrides[i] || 0
      let j = i + 1
      while (j < to && (overrides[j] || 0) === id) j++
      const text = escapeHtml(chars.slice(i, j))
      const o = id ? table[id] : null
      if (o) {
        const sub = `${cls}-s${id}`
        if (!usedOverrides.has(sub)) {
          usedOverrides.add(sub)
          addRule('.' + sub, typeDecls(o, o.fills, size))
        }
        const act = o.hyperlink ? linkActions(o.hyperlink) : null
        html += act
          ? `<span class="${sub} hot" data-act="${escapeHtml(JSON.stringify(act))}">${text}</span>`
          : `<span class="${sub}">${text}</span>`
      } else {
        html += text
      }
      i = j
    }
    return html
  }

  if (!lineTypes.some((/** @type {string} */ t) => t === 'ORDERED' || t === 'UNORDERED')) {
    return runs(0, chars.length)
  }

  // Figma draws list markers itself, they aren't part of the characters.
  let html = ''
  let start = 0
  let number = 0
  const lines = chars.split('\n')
  lines.forEach((line, index) => {
    const type = lineTypes[index]
    if (type === 'ORDERED') html += `${++number}. `
    else if (type === 'UNORDERED') html += '\u2022 '
    if (type !== 'ORDERED') number = 0
    html += runs(start, start + line.length)
    if (index < lines.length - 1) html += '\n'
    start += line.length + 1
  })
  return html
}

/**
 * Every font face (family, weight, italic) a text node uses.
 * @param {any} node
 * @returns {Array<{ family: string, weight: number, italic: boolean }>}
 */
function fontsOf (node) {
  const base = node.style || {}
  const faces = []
  if (base.fontFamily) faces.push({ family: base.fontFamily, weight: base.fontWeight || 400, italic: !!base.italic })
  for (const o of Object.values(node.styleOverrideTable || {})) {
    if (!o || (!o.fontFamily && !o.fontWeight && o.italic === undefined)) continue
    faces.push({
      family: o.fontFamily || base.fontFamily,
      weight: o.fontWeight || base.fontWeight || 400,
      italic: o.italic === undefined ? !!base.italic : !!o.italic
    })
  }
  return faces.filter((f) => f.family)
}

module.exports = { typeDecls, textLayout, textContent, fontsOf, FALLBACK_FONTS }
