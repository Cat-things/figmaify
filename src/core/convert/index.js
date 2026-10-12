'use strict'

const { px, pct, round, color, idToClass, escapeHtml } = require('./units')
const { visiblePaints, background, strokeOf, effectsOf, radiusOf, blendOf } = require('./paint')
const { isFlex, relativeBox, hugs, flexItem, absolute, flexContainer, shorthand } = require('./layout')
const { typeDecls, textLayout, textContent, fontsOf } = require('./text')
const { actionsOf } = require('./interactions')

/**
 * @typedef {[string, string]} Decl
 * @typedef {'skip' | 'box' | 'text' | 'svg' | 'png'} Mode
 */

const CONTAINERS = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'])
const VECTORS = new Set(['VECTOR', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION', 'LINE'])
const WINDOW_TAGS = ['close', 'minimize', 'maximize']
const OVERLAY_POSITIONS = {
  CENTER: 'center',
  TOP_LEFT: 'top-left',
  TOP_CENTER: 'top-center',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_CENTER: 'bottom-center',
  BOTTOM_RIGHT: 'bottom-right'
}

/**
 * Layer name tags like "Search @input" or "Title bar @drag".
 * @param {any} node
 * @returns {Set<string>}
 */
function tagsOf (node) {
  const found = String(node.name || '').toLowerCase().match(/@[a-z]+/g)
  return new Set(found || [])
}

/** @param {any} node */
function isRotated (node) {
  return Math.abs(node.rotation || 0) > 0.001
}

/** @param {any} node */
function isFullEllipse (node) {
  const arc = node.arcData
  if (!arc) return true
  const sweep = Math.abs(arc.endingAngle - arc.startingAngle)
  return !arc.innerRadius && Math.abs(sweep - Math.PI * 2) < 0.01
}

/**
 * How a node ends up in the output. Anything CSS can't reproduce reliably
 * gets rendered by Figma as an image instead.
 * @param {any} node
 * @returns {Mode}
 */
function renderMode (node) {
  if (node.visible === false) return 'skip'
  if (tagsOf(node).has('@image')) return 'png'

  const type = node.type
  if (isRotated(node)) {
    return VECTORS.has(type) || type === 'RECTANGLE' || type === 'ELLIPSE' ? 'svg' : 'png'
  }
  if (type === 'TEXT') return 'text'
  if (VECTORS.has(type)) return 'svg'
  if (type === 'ELLIPSE') return isFullEllipse(node) ? 'box' : 'svg'
  if (type === 'RECTANGLE') return 'box'
  if (CONTAINERS.has(type)) {
    const masked = (node.children || []).some((/** @type {any} */ c) => c.isMask && c.visible !== false)
    return masked ? 'png' : 'box'
  }
  return 'png'
}

/**
 * First pass over the screens: everything that has to be downloaded or
 * rendered before HTML can be written.
 * @param {any[]} screens
 */
function analyze (screens) {
  /** @type {{ svg: Array<{ id: string, cls: string }>, png: Array<{ id: string, cls: string }> }} */
  const renders = { svg: [], png: [] }
  /** @type {Set<string>} */
  const imageRefs = new Set()
  /** @type {Array<{ family: string, weight: number, italic: boolean }>} */
  const fonts = []

  /** @param {any} node @param {boolean} root */
  const visit = (node, root) => {
    const mode = root ? 'box' : renderMode(node)
    if (mode === 'skip' || node.isMask || !node.absoluteBoundingBox) return
    if (mode === 'svg' || mode === 'png') {
      renders[mode].push({ id: node.id, cls: idToClass(node.id) })
      return
    }
    for (const p of visiblePaints(node.fills)) {
      if (p.type === 'IMAGE' && p.imageRef) imageRefs.add(p.imageRef)
    }
    if (mode === 'text') {
      fonts.push(...fontsOf(node))
      return
    }
    for (const child of node.children || []) visit(child, false)
  }

  for (const screen of screens) visit(screen, true)
  return { renders, imageRefs, fonts }
}

/**
 * Every node id a screen's prototype links can jump to.
 * @param {any} root
 * @returns {Set<string>}
 */
function linkedFrames (root) {
  /** @type {Set<string>} */
  const out = new Set()
  /** @param {any} node */
  const visit = (node) => {
    if (node.visible === false) return
    if (node.transitionNodeID) out.add(node.transitionNodeID)
    for (const interaction of node.interactions || []) {
      for (const a of interaction.actions || []) {
        if (a && a.type === 'NODE' && a.destinationId && a.navigation !== 'SCROLL_TO' && a.navigation !== 'CHANGE_TO') {
          out.add(a.destinationId)
        }
      }
    }
    for (const child of node.children || []) visit(child)
  }
  visit(root)
  return out
}

class Emitter {
  /**
   * @param {{
   *   screens: any[],
   *   imageUrl: (ref: string) => string | null,
   *   renderUrl: (cls: string, kind: 'svg' | 'png') => string | null
   * }} opts
   */
  constructor (opts) {
    this.imageUrl = opts.imageUrl
    this.renderUrl = opts.renderUrl
    /** @type {Map<string, string>} */
    this.screenIds = new Map(opts.screens.map((s) => [s.id, 's-' + idToClass(s.id).slice(1)]))
    /** @type {Array<[string, Decl[]]>} */
    this.rules = []
    /** @type {Map<string, string>} */
    this.warnings = new Map()
    /** @type {Set<string>} */
    this.placeholders = new Set()
    /** @type {Set<string>} */
    this.windowButtons = new Set()
    this.hasDrag = false

    this.actionContext = {
      screenDomId: (/** @type {string} */ id) => this.screenIds.get(id) || null,
      nodeClass: idToClass,
      warn: (/** @type {string} */ key, /** @type {string} */ message) => this.warn(key, message)
    }
  }

  /** @param {string} key @param {string} message */
  warn (key, message) {
    if (!this.warnings.has(key)) this.warnings.set(key, message)
  }

  /**
   * Rules are kept by reference, so a parent can register its rule before
   * its children and still add declarations afterwards. Keeps the CSS in
   * document order.
   * @param {string} selector
   * @param {Decl[]} decls
   */
  addRule (selector, decls) {
    this.rules.push([selector, decls])
  }

  css () {
    return this.rules
      .filter(([, decls]) => decls.length)
      .map(([selector, decls]) => `${selector} {\n${decls.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`)
      .join('\n\n') + '\n'
  }

  /** @param {any} root */
  screen (root) {
    const cls = idToClass(root.id)
    const b = root.absoluteBoundingBox
    /** @type {Decl[]} */
    const decls = [['--w', px(b.width)], ['--h', px(b.height)]]
    const box = { x: 0, y: 0, w: b.width, h: b.height }

    const { attrs, classes } = this.behavior(root, ['frame', cls])
    this.addRule('.' + cls, decls)
    const inner = this.box(root, cls, box, decls, tagsOf(root))

    const sectionAttrs = [
      `class="screen"`,
      `id="${this.screenIds.get(root.id)}"`,
      `data-name="${escapeHtml(root.name || '')}"`
    ]
    const pos = /** @type {Record<string, string>} */ (OVERLAY_POSITIONS)[root.overlayPositionType]
    if (pos && pos !== 'center') sectionAttrs.push(`data-pos="${pos}"`)
    const bg = root.overlayBackground
    if (bg && bg.type === 'SOLID_COLOR' && bg.color) sectionAttrs.push(`data-backdrop="${color(bg.color)}"`)
    if (root.overlayBackgroundInteraction === 'CLOSE_ON_CLICK_OUTSIDE') sectionAttrs.push('data-dismiss')

    return `<section ${sectionAttrs.join(' ')} hidden>\n<div class="${classes.join(' ')}"${attrs}>${inner}</div>\n</section>`
  }

  /**
   * Click actions, timers, key handlers and window tags for a node.
   * @param {any} node
   * @param {string[]} classes
   */
  behavior (node, classes) {
    const tags = tagsOf(node)
    const acts = actionsOf(node, this.actionContext)
    let attrs = ''

    // A text layer that is a link as a whole works like a button.
    const link = node.type === 'TEXT' && node.style && node.style.hyperlink
    if (link && !acts.click.length) acts.click = this.linkActions(link) || []

    if (acts.click.length) {
      classes.push('hot')
      attrs += ` data-act="${escapeHtml(JSON.stringify(acts.click))}" role="button" tabindex="0"`
    }
    if (acts.timer) attrs += ` data-timer="${escapeHtml(JSON.stringify(acts.timer))}"`
    if (acts.keys.length) attrs += ` data-keys="${escapeHtml(JSON.stringify(acts.keys))}"`

    const win = WINDOW_TAGS.find((name) => tags.has('@' + name))
    if (win) {
      this.windowButtons.add(win)
      classes.push('hot')
      attrs += ` data-win="${win}"`
    }
    if (tags.has('@drag')) {
      this.hasDrag = true
      classes.push('drag')
    }
    return { attrs, classes }
  }

  /**
   * Text hyperlinks point at a web page or at another frame.
   * @param {any} link
   */
  linkActions (link) {
    if (link.type === 'URL' && /^(https?:|mailto:)/i.test(link.url || '')) return [{ do: 'url', url: link.url }]
    const to = link.type === 'NODE' && this.screenIds.get(link.nodeID || link.value)
    return to ? [{ do: 'go', to }] : null
  }

  /**
   * @param {any} node
   * @param {any} parent
   * @param {number} flowIndex
   * @returns {string}
   */
  node (node, parent, flowIndex) {
    const mode = renderMode(node)
    if (mode === 'skip' || node.isMask) return ''
    const box = relativeBox(node, parent)
    if (!box) return ''

    const cls = idToClass(node.id)
    const tags = tagsOf(node)
    const decls = this.placement(node, parent, box, flowIndex, mode)
    const { attrs, classes } = this.behavior(node, [cls])

    if (mode !== 'svg' && mode !== 'png' && node.opacity !== undefined && node.opacity < 1) {
      decls.push(['opacity', String(round(node.opacity, 3))])
    }
    const blend = blendOf(node.blendMode)
    if (blend) decls.push(['mix-blend-mode', blend])

    this.addRule('.' + cls, decls)

    if (mode === 'text' && (tags.has('@input') || tags.has('@password'))) {
      return this.textAsInput(node, cls, box, decls, tags, classes)
    }

    let inner = ''
    if (mode === 'svg' || mode === 'png') {
      inner = this.image(node, cls, mode)
    } else if (mode === 'text') {
      if (this.placeholders.has(node.id)) classes.push('ph')
      inner = this.text(node, cls, box, decls)
    } else {
      inner = this.box(node, cls, box, decls, tags)
    }

    return `<div class="${classes.join(' ')}"${attrs}>${inner}</div>`
  }

  /**
   * @param {any} node
   * @param {any} parent
   * @param {{ x: number, y: number, w: number, h: number }} box
   * @param {number} flowIndex
   * @param {Mode} mode
   * @returns {Decl[]}
   */
  placement (node, parent, box, flowIndex, mode) {
    if (isFlex(parent) && node.layoutPositioning !== 'ABSOLUTE') {
      return flexItem(node, parent, box, flowIndex)
    }
    const p = parent.absoluteBoundingBox
    const hug = {
      h: isFlex(node) && hugs(node, 'h'),
      v: (isFlex(node) || mode === 'text') && hugs(node, 'v')
    }
    return absolute(node, box, { w: p.width, h: p.height }, hug)
  }

  /**
   * Figma rendered this one for us. The wrapper keeps the layout box and the
   * image sits inside it at the render bounds, which include shadows and strokes.
   * @param {any} node
   * @param {string} cls
   * @param {'svg' | 'png'} kind
   */
  image (node, cls, kind) {
    const url = this.renderUrl(cls, kind)
    if (!url) {
      this.warn('render:' + node.id, `Figma didn't render "${node.name}", it was left out.`)
      return ''
    }
    const b = node.absoluteBoundingBox
    const r = node.absoluteRenderBounds || b
    /** @type {Decl[]} */
    const decls = [['position', 'absolute']]
    if (b.width > 0) decls.push(['left', pct((r.x - b.x) / b.width)], ['width', pct(r.width / b.width)])
    else decls.push(['left', px(r.x - b.x)], ['width', px(r.width)])
    if (b.height > 0) decls.push(['top', pct((r.y - b.y) / b.height)], ['height', pct(r.height / b.height)])
    else decls.push(['top', px(r.y - b.y)], ['height', px(r.height)])
    this.addRule(`.${cls} > img`, decls)
    return `<img src="${url}" alt="" draggable="false">`
  }

  /**
   * @param {any} node
   * @param {string} cls
   * @param {{ w: number, h: number }} box
   * @param {Decl[]} decls
   */
  text (node, cls, box, decls) {
    const size = { w: box.w, h: box.h }
    const layout = textLayout(node)
    decls.push(...layout.box)

    /** @type {Decl[]} */
    const para = typeDecls(node.style, node.fills, size).concat(layout.para)
    const fx = effectsOf(node, true)
    if (fx.shadows.length) para.push(['text-shadow', fx.shadows.join(', ')])
    if (fx.filter) decls.push(['filter', fx.filter])
    const stroke = strokeOf(node)
    if (stroke) para.push(['-webkit-text-stroke', `${px(stroke.sides[0])} ${stroke.color}`])
    this.addRule(`.${cls} > p`, para)

    const html = textContent(node, cls, size, (sel, d) => this.addRule(sel, d), (link) => this.linkActions(link))
    return `<p>${html}</p>`
  }

  /**
   * A text layer tagged @input becomes the input itself.
   * @param {any} node
   * @param {string} cls
   * @param {{ w: number, h: number }} box
   * @param {Decl[]} decls
   * @param {Set<string>} tags
   * @param {string[]} classes
   */
  textAsInput (node, cls, box, decls, tags, classes) {
    const style = node.style || {}
    decls.push(...typeDecls(style, node.fills, { w: box.w, h: box.h }))
    if (style.textAlignHorizontal === 'CENTER') decls.push(['text-align', 'center'])
    if (style.textAlignHorizontal === 'RIGHT') decls.push(['text-align', 'right'])
    classes.push('field')
    const type = tags.has('@password') ? 'password' : 'text'
    return `<input class="${classes.join(' ')}" type="${type}" placeholder="${escapeHtml(node.characters || '')}" spellcheck="false">`
  }

  /**
   * Frames, groups, rectangles and full ellipses.
   * @param {any} node
   * @param {string} cls
   * @param {{ w: number, h: number }} box
   * @param {Decl[]} decls
   * @param {Set<string>} tags
   */
  box (node, cls, box, decls, tags) {
    const size = { w: box.w, h: box.h }

    const bg = background(node.fills, size, this.imageUrl)
    if (bg) decls.push(['background', bg])

    const radius = node.type === 'ELLIPSE' ? '50%' : radiusOf(node)
    if (radius) decls.push(['border-radius', radius])

    const fx = effectsOf(node, false)
    const shadows = fx.shadows.slice()
    const stroke = strokeOf(node)
    if (stroke) shadows.unshift(...this.stroke(cls, stroke, decls))
    if (shadows.length) decls.push(['box-shadow', shadows.join(', ')])
    if (fx.filter) decls.push(['filter', fx.filter])
    if (fx.backdrop) decls.push(['backdrop-filter', fx.backdrop])

    const dir = node.overflowDirection
    if (dir && dir !== 'NONE') {
      decls.push(['overflow-x', dir.includes('HORIZONTAL') ? 'auto' : 'hidden'])
      decls.push(['overflow-y', dir.includes('VERTICAL') ? 'auto' : 'hidden'])
    } else if (node.clipsContent) {
      decls.push(['overflow', 'hidden'])
    }

    if (isFlex(node)) decls.push(...flexContainer(node))

    const field = tags.has('@input') || tags.has('@password') ? 'input' : tags.has('@textarea') ? 'textarea' : null
    const placeholder = field ? firstText(node) : null
    if (placeholder) this.placeholders.add(placeholder.id)

    let flowIndex = 0
    let html = ''
    for (const child of node.children || []) {
      const flows = isFlex(node) && child.layoutPositioning !== 'ABSOLUTE'
      const out = this.node(child, node, flows ? flowIndex : 0)
      if (flows && out) flowIndex++
      html += out
    }

    if (field) html += this.field(node, cls, field, placeholder, tags)
    return html
  }

  /**
   * Inside strokes go on ::after so they paint over children like Figma does.
   * Outside strokes become box shadows. Center strokes are split between both.
   * @param {string} cls
   * @param {NonNullable<ReturnType<typeof strokeOf>>} stroke
   * @param {Decl[]} decls
   * @returns {string[]} box shadows for the outside part
   */
  stroke (cls, stroke, decls) {
    const share = stroke.align === 'OUTSIDE' ? 0 : stroke.align === 'CENTER' ? 0.5 : 1
    const inside = stroke.sides.map((s) => s * share)
    const outside = stroke.sides.map((s) => s * (1 - share))
    /** @type {string[]} */
    const shadows = []

    if (outside.some((s) => s > 0)) {
      const uniform = outside.every((s) => s === outside[0])
      if (stroke.dashed && uniform) {
        decls.push(['outline', `${px(outside[0])} dashed ${stroke.color}`])
      } else if (uniform) {
        shadows.push(`0 0 0 ${px(outside[0])} ${stroke.color}`)
      } else {
        // Uneven outside strokes are rare, draw them inside instead.
        inside.forEach((_, i) => { inside[i] += outside[i] })
      }
    }

    if (inside.some((s) => s > 0)) {
      this.addRule(`.${cls}::after`, [
        ['content', '""'],
        ['position', 'absolute'],
        ['inset', '0'],
        ['border-radius', 'inherit'],
        ['border-style', stroke.dashed ? 'dashed' : 'solid'],
        ['border-width', shorthand(inside)],
        ['border-color', stroke.color],
        ['pointer-events', 'none']
      ])
    }
    return shadows
  }

  /**
   * A frame tagged @input or @textarea gets a real field on top. The text
   * layer inside stays in place (hidden) so the layout doesn't shift, and
   * its content becomes the placeholder.
   * @param {any} node
   * @param {string} cls
   * @param {'input' | 'textarea'} kind
   * @param {any} placeholder
   * @param {Set<string>} tags
   */
  field (node, cls, kind, placeholder, tags) {
    const fieldCls = `${cls}-f`
    const outer = node.absoluteBoundingBox
    /** @type {Decl[]} */
    let decls = [['inset', '0']]

    if (placeholder) {
      const t = placeholder.absoluteBoundingBox
      const left = Math.max(0, t.x - outer.x)
      const right = Math.max(0, Math.min(left, outer.x + outer.width - t.x - t.width))
      const top = Math.max(0, t.y - outer.y)
      decls.push(['padding', shorthand(kind === 'textarea' ? [top, right, top, left] : [0, right, 0, left])])
      decls = decls.concat(typeDecls(placeholder.style, placeholder.fills, { w: t.width, h: t.height }))
      const align = placeholder.style && placeholder.style.textAlignHorizontal
      if (align === 'CENTER') decls.push(['text-align', 'center'])
      if (align === 'RIGHT') decls.push(['text-align', 'right'])
    }
    this.addRule('.' + fieldCls, decls)

    const text = placeholder ? escapeHtml(placeholder.characters || '') : ''
    if (kind === 'textarea') {
      return `<textarea class="${fieldCls} field" placeholder="${text}" spellcheck="false"></textarea>`
    }
    const type = tags.has('@password') ? 'password' : 'text'
    return `<input class="${fieldCls} field" type="${type}" placeholder="${text}" spellcheck="false">`
  }
}

/** @param {any} node @returns {any} */
function firstText (node) {
  for (const child of node.children || []) {
    if (child.visible === false) continue
    if (child.type === 'TEXT') return child
    const found = firstText(child)
    if (found) return found
  }
  return null
}

/**
 * Second pass: HTML for every screen plus the stylesheet.
 * @param {{
 *   screens: any[],
 *   imageUrl: (ref: string) => string | null,
 *   renderUrl: (cls: string, kind: 'svg' | 'png') => string | null
 * }} opts
 */
function emit (opts) {
  const emitter = new Emitter(opts)
  const sections = opts.screens.map((s) => emitter.screen(s))

  for (const s of opts.screens) {
    if ((s.children || []).some((/** @type {any} */ c) => c.isMask && c.visible !== false)) {
      emitter.warn('mask:' + s.id, `"${s.name}" has a mask directly on the frame. Wrap the masked layers in a group so they convert as one image.`)
    }
  }

  return {
    html: sections.join('\n'),
    css: emitter.css(),
    screenIds: emitter.screenIds,
    warnings: [...emitter.warnings.values()],
    windowButtons: emitter.windowButtons,
    hasDrag: emitter.hasDrag
  }
}

module.exports = { analyze, emit, renderMode, tagsOf, linkedFrames }
