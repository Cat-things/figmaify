'use strict'

const { round, px, pct, color } = require('./units')

/**
 * @typedef {{ x: number, y: number }} Vec
 * @typedef {{ color: any, position: number }} Stop
 * @typedef {{ w: number, h: number }} Size
 * @typedef {(ref: string) => string | null} ImageLookup
 */

/** @param {any[] | undefined} paints */
function visiblePaints (paints) {
  return (paints || []).filter((p) => p && p.visible !== false && (p.opacity === undefined || p.opacity > 0))
}

/**
 * CSS background shorthand for a node's fills, or null when there's nothing to paint.
 * Figma lists fills bottom to top, CSS lists background layers top to bottom.
 * @param {any[] | undefined} fills
 * @param {Size} size
 * @param {ImageLookup} imageUrl
 */
function background (fills, size, imageUrl) {
  const paints = visiblePaints(fills)
  /** @type {string[]} */
  const layers = []
  let base = ''

  paints.forEach((paint, i) => {
    if (paint.type === 'SOLID') {
      const c = color(paint.color, paint.opacity)
      if (i === 0) base = c
      else layers.unshift(`linear-gradient(${c}, ${c})`)
      return
    }
    const layer = paintLayer(paint, size, imageUrl)
    if (layer) layers.unshift(layer)
  })

  if (base) layers.push(base)
  return layers.length ? layers.join(', ') : null
}

/**
 * @param {any} paint
 * @param {Size} size
 * @param {ImageLookup} imageUrl
 */
function paintLayer (paint, size, imageUrl) {
  switch (paint.type) {
    case 'GRADIENT_LINEAR':
      return linearGradient(paint, size)
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_DIAMOND':
      return radialGradient(paint, size)
    case 'GRADIENT_ANGULAR':
      return conicGradient(paint, size)
    case 'IMAGE': {
      const url = paint.imageRef ? imageUrl(paint.imageRef) : null
      if (!url) return null
      const src = `url("${url}")`
      switch (paint.scaleMode) {
        case 'FIT': return `${src} center / contain no-repeat`
        case 'TILE': return `${src} 0 0 repeat`
        case 'STRETCH':
          // CROP in the Figma UI comes through as STRETCH with a transform.
          // Cover gets close enough without decoding the image.
          return paint.imageTransform ? `${src} center / cover no-repeat` : `${src} 0 0 / 100% 100% no-repeat`
        default: return `${src} center / cover no-repeat`
      }
    }
    default:
      return null
  }
}

/**
 * @param {Stop[]} stops
 * @param {number} opacity
 * @param {(t: number) => number} [place] maps a Figma stop position to a CSS percent
 */
function stopList (stops, opacity, place = (t) => t * 100) {
  return stops
    .map((s) => `${color(s.color, opacity)} ${round(place(s.position), 2)}%`)
    .join(', ')
}

/** @param {any} paint @param {Size} size */
function linearGradient (paint, size) {
  const stops = paint.gradientStops || []
  if (!stops.length) return null
  const handles = paint.gradientHandlePositions || []
  const opacity = paint.opacity === undefined ? 1 : paint.opacity
  const w = size.w || 1
  const h = size.h || 1

  if (handles.length < 2) return `linear-gradient(${stopList(stops, opacity)})`

  const x0 = handles[0].x * w
  const y0 = handles[0].y * h
  const dx = handles[1].x * w - x0
  const dy = handles[1].y * h - y0
  const len = Math.hypot(dx, dy)
  if (!len) {
    const c = color(stops[stops.length - 1].color, opacity)
    return `linear-gradient(${c}, ${c})`
  }

  const ux = dx / len
  const uy = dy / len
  let angle = Math.atan2(ux, -uy) * 180 / Math.PI
  if (angle < 0) angle += 360

  // CSS runs the gradient line through the box center with a length that
  // touches the far corners. Project Figma's handle positions onto it.
  const lineLength = Math.abs(w * ux) + Math.abs(h * uy)
  const sx = w / 2 - ux * lineLength / 2
  const sy = h / 2 - uy * lineLength / 2
  const offset = (x0 - sx) * ux + (y0 - sy) * uy
  const place = (/** @type {number} */ t) => (offset + t * len) / lineLength * 100

  return `linear-gradient(${round(angle, 2)}deg, ${stopList(stops, opacity, place)})`
}

/** @param {any} paint @param {Size} size */
function radialGradient (paint, size) {
  const stops = paint.gradientStops || []
  if (!stops.length) return null
  const handles = paint.gradientHandlePositions || []
  const opacity = paint.opacity === undefined ? 1 : paint.opacity
  if (handles.length < 3) return `radial-gradient(${stopList(stops, opacity)})`

  const w = size.w || 1
  const h = size.h || 1
  const [c, a, b] = handles
  const rx = Math.hypot((a.x - c.x) * w, (a.y - c.y) * h)
  const ry = Math.hypot((b.x - c.x) * w, (b.y - c.y) * h)
  return `radial-gradient(${pct(rx / w)} ${pct(ry / h)} at ${pct(c.x)} ${pct(c.y)}, ${stopList(stops, opacity)})`
}

/** @param {any} paint @param {Size} size */
function conicGradient (paint, size) {
  const stops = paint.gradientStops || []
  if (!stops.length) return null
  const handles = paint.gradientHandlePositions || []
  const opacity = paint.opacity === undefined ? 1 : paint.opacity
  if (handles.length < 2) return `conic-gradient(${stopList(stops, opacity)})`

  const w = size.w || 1
  const h = size.h || 1
  const [c, a] = handles
  let angle = Math.atan2((a.x - c.x) * w, -(a.y - c.y) * h) * 180 / Math.PI
  if (angle < 0) angle += 360
  return `conic-gradient(from ${round(angle, 2)}deg at ${pct(c.x)} ${pct(c.y)}, ${stopList(stops, opacity)})`
}

/**
 * The top visible paint as a flat color, for places CSS only takes one color.
 * @param {any[] | undefined} paints
 */
function flatColor (paints) {
  const list = visiblePaints(paints)
  const top = list[list.length - 1]
  if (!top) return null
  const opacity = top.opacity === undefined ? 1 : top.opacity
  if (top.type === 'SOLID') return color(top.color, opacity)
  if (top.gradientStops && top.gradientStops.length) return color(top.gradientStops[0].color, opacity)
  return null
}

/**
 * @param {any} node
 * @returns {{ color: string, align: string, dashed: boolean, sides: [number, number, number, number] } | null}
 */
function strokeOf (node) {
  const c = flatColor(node.strokes)
  if (!c) return null

  const w = node.strokeWeight === undefined ? 1 : node.strokeWeight
  const ind = node.individualStrokeWeights
  /** @type {[number, number, number, number]} */
  const sides = ind ? [ind.top, ind.right, ind.bottom, ind.left] : [w, w, w, w]
  if (!sides.some((s) => s > 0)) return null

  return {
    color: c,
    align: node.strokeAlign || 'INSIDE',
    dashed: Array.isArray(node.strokeDashes) && node.strokeDashes.length > 0,
    sides
  }
}

/**
 * @param {any} node
 * @param {boolean} isText
 */
function effectsOf (node, isText) {
  /** @type {string[]} */
  const shadows = []
  /** @type {string[]} */
  const filters = []
  /** @type {string[]} */
  const backdrop = []

  for (const e of (node.effects || []).slice().reverse()) {
    if (e.visible === false) continue
    const off = e.offset || { x: 0, y: 0 }
    const c = e.color ? color(e.color) : 'rgba(0, 0, 0, 0.25)'
    if (e.type === 'DROP_SHADOW') {
      shadows.push(isText
        ? `${px(off.x)} ${px(off.y)} ${px(e.radius || 0)} ${c}`
        : `${px(off.x)} ${px(off.y)} ${px(e.radius || 0)} ${px(e.spread || 0)} ${c}`)
    } else if (e.type === 'INNER_SHADOW' && !isText) {
      shadows.push(`inset ${px(off.x)} ${px(off.y)} ${px(e.radius || 0)} ${px(e.spread || 0)} ${c}`)
    } else if (e.type === 'LAYER_BLUR') {
      filters.push(`blur(${px((e.radius || 0) / 2)})`)
    } else if (e.type === 'BACKGROUND_BLUR') {
      backdrop.push(`blur(${px((e.radius || 0) / 2)})`)
    }
  }

  return { shadows, filter: filters.join(' '), backdrop: backdrop.join(' ') }
}

/** @param {any} node */
function radiusOf (node) {
  const r = node.rectangleCornerRadii
  if (Array.isArray(r) && r.length === 4) {
    if (r.every((v) => v === r[0])) return r[0] ? px(r[0]) : null
    return r.map(px).join(' ')
  }
  return node.cornerRadius ? px(node.cornerRadius) : null
}

const BLEND = {
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity'
}

/** @param {string | undefined} mode */
function blendOf (mode) {
  return (mode && /** @type {Record<string, string>} */ (BLEND)[mode]) || null
}

module.exports = {
  visiblePaints,
  background,
  linearGradient,
  radialGradient,
  flatColor,
  strokeOf,
  effectsOf,
  radiusOf,
  blendOf
}
