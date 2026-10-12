'use strict'

const { px, pct } = require('./units')

/**
 * @typedef {[string, string]} Decl
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 */

/** @param {any} node */
function isFlex (node) {
  return node && (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL')
}

/**
 * Box of `node` relative to `parent`, both from absoluteBoundingBox.
 * @param {any} node
 * @param {any} parent
 * @returns {Box | null}
 */
function relativeBox (node, parent) {
  const b = node.absoluteBoundingBox
  if (!b) return null
  const p = parent && parent.absoluteBoundingBox
  return {
    x: p ? b.x - p.x : 0,
    y: p ? b.y - p.y : 0,
    w: b.width,
    h: b.height
  }
}

/**
 * Whether the node sizes itself to its content along an axis.
 * @param {any} node
 * @param {'h' | 'v'} axis
 */
function hugs (node, axis) {
  const explicit = axis === 'h' ? node.layoutSizingHorizontal : node.layoutSizingVertical
  if (explicit) return explicit === 'HUG'

  if (node.type === 'TEXT') {
    const mode = node.style && node.style.textAutoResize
    if (mode === 'WIDTH_AND_HEIGHT') return true
    if (mode === 'HEIGHT') return axis === 'v'
    return false
  }
  if (isFlex(node)) {
    const primary = (node.layoutMode === 'HORIZONTAL') === (axis === 'h')
    return primary ? node.primaryAxisSizingMode === 'AUTO' : node.counterAxisSizingMode === 'AUTO'
  }
  return false
}

/**
 * FIXED, HUG or FILL for a child inside an auto layout parent.
 * @param {any} node
 * @param {any} parent
 * @param {'h' | 'v'} axis
 */
function sizingIn (node, parent, axis) {
  const explicit = axis === 'h' ? node.layoutSizingHorizontal : node.layoutSizingVertical
  if (explicit) return explicit
  const primary = (parent.layoutMode === 'HORIZONTAL') === (axis === 'h')
  if (primary && node.layoutGrow === 1) return 'FILL'
  if (!primary && node.layoutAlign === 'STRETCH') return 'FILL'
  return hugs(node, axis) ? 'HUG' : 'FIXED'
}

/** @param {any} node @returns {Decl[]} */
function minMax (node) {
  /** @type {Decl[]} */
  const out = []
  if (node.minWidth != null) out.push(['min-width', px(node.minWidth)])
  if (node.maxWidth != null) out.push(['max-width', px(node.maxWidth)])
  if (node.minHeight != null) out.push(['min-height', px(node.minHeight)])
  if (node.maxHeight != null) out.push(['max-height', px(node.maxHeight)])
  return out
}

/**
 * Placement for a normal flow child of an auto layout frame.
 * @param {any} node
 * @param {any} parent
 * @param {Box} box
 * @param {number} flowIndex position among the parent's flow children
 * @returns {Decl[]}
 */
function flexItem (node, parent, box, flowIndex) {
  const row = parent.layoutMode === 'HORIZONTAL'
  /** @type {Decl[]} */
  const out = [['position', 'relative']]
  let shrink = true

  for (const axis of /** @type {const} */ (['h', 'v'])) {
    const size = axis === 'h' ? box.w : box.h
    const prop = axis === 'h' ? 'width' : 'height'
    const primary = row === (axis === 'h')
    const mode = sizingIn(node, parent, axis)

    if (mode === 'FILL') {
      if (primary) {
        out.push(['flex', '1 1 0'])
        out.push([axis === 'h' ? 'min-width' : 'min-height', '0'])
        shrink = false
      } else {
        out.push(['align-self', 'stretch'])
      }
    } else if (mode === 'FIXED') {
      out.push([prop, px(size)])
    }
  }

  if (shrink) out.push(['flex-shrink', '0'])

  const spacing = parent.itemSpacing || 0
  if (spacing < 0 && flowIndex > 0 && parent.primaryAxisAlignItems !== 'SPACE_BETWEEN') {
    out.push([row ? 'margin-left' : 'margin-top', px(spacing)])
  }

  return out.concat(minMax(node))
}

/**
 * Absolute placement that follows the node's resize constraints, so the
 * converted app stretches the way the frame does in Figma.
 * @param {any} node
 * @param {Box} box
 * @param {{ w: number, h: number }} parentSize
 * @param {{ h: boolean, v: boolean }} hug axes that should size to content
 * @returns {Decl[]}
 */
function absolute (node, box, parentSize, hug) {
  const c = node.constraints || {}
  return /** @type {Decl[]} */ ([['position', 'absolute']])
    .concat(axis(c.horizontal, box.x, box.w, parentSize.w, 'left', 'right', 'width', hug.h))
    .concat(axis(c.vertical, box.y, box.h, parentSize.h, 'top', 'bottom', 'height', hug.v))
}

/**
 * @param {string | undefined} mode
 * @param {number} start
 * @param {number} size
 * @param {number} parentSize
 * @param {string} startProp
 * @param {string} endProp
 * @param {string} sizeProp
 * @param {boolean} hug
 * @returns {Decl[]}
 */
function axis (mode, start, size, parentSize, startProp, endProp, sizeProp, hug) {
  const end = parentSize - start - size
  /** @type {Decl[]} */
  const sized = hug ? [] : [[sizeProp, px(size)]]

  switch (mode) {
    case 'RIGHT':
    case 'BOTTOM':
      return [[endProp, px(end)], ...sized]
    case 'LEFT_RIGHT':
    case 'TOP_BOTTOM':
      return [[startProp, px(start)], [endProp, px(end)]]
    case 'CENTER': {
      const offset = start - parentSize / 2
      const value = offset === 0 ? '50%' : `calc(50% ${offset < 0 ? '-' : '+'} ${px(Math.abs(offset))})`
      return [[startProp, value], ...sized]
    }
    case 'SCALE':
      if (parentSize > 0) return [[startProp, pct(start / parentSize)], [sizeProp, pct(size / parentSize)]]
      return [[startProp, px(start)], ...sized]
    default:
      return [[startProp, px(start)], ...sized]
  }
}

const JUSTIFY = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' }
const ALIGN = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' }

/**
 * Container side of auto layout.
 * @param {any} node
 * @returns {Decl[]}
 */
function flexContainer (node) {
  const row = node.layoutMode === 'HORIZONTAL'
  /** @type {Decl[]} */
  const out = [['display', 'flex'], ['flex-direction', row ? 'row' : 'column']]

  const justify = /** @type {Record<string, string>} */ (JUSTIFY)[node.primaryAxisAlignItems || 'MIN']
  if (justify && justify !== 'flex-start') out.push(['justify-content', justify])
  out.push(['align-items', /** @type {Record<string, string>} */ (ALIGN)[node.counterAxisAlignItems || 'MIN'] || 'flex-start'])

  const spacing = Math.max(0, node.itemSpacing || 0)
  const between = node.primaryAxisAlignItems === 'SPACE_BETWEEN'

  if (node.layoutWrap === 'WRAP') {
    out.push(['flex-wrap', 'wrap'])
    const cross = node.counterAxisSpacing == null ? spacing : node.counterAxisSpacing
    const main = between ? 0 : spacing
    out.push(['gap', row ? `${px(cross)} ${px(main)}` : `${px(main)} ${px(cross)}`])
    if (node.counterAxisAlignContent === 'SPACE_BETWEEN') out.push(['align-content', 'space-between'])
  } else if (spacing && !between) {
    out.push(['gap', px(spacing)])
  }

  const pad = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map((v) => v || 0)
  if (pad.some((v) => v)) out.push(['padding', shorthand(pad)])

  return out
}

/**
 * CSS box shorthand for top, right, bottom, left.
 * @param {number[]} values
 */
function shorthand (values) {
  const [t, r, b, l] = values.map(px)
  if (t === r && r === b && b === l) return t
  if (t === b && r === l) return `${t} ${r}`
  if (r === l) return `${t} ${r} ${b}`
  return `${t} ${r} ${b} ${l}`
}

module.exports = { shorthand, isFlex, relativeBox, hugs, sizingIn, flexItem, absolute, flexContainer }
