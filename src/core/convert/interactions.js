'use strict'

// Turns Figma prototype interactions into small action lists the generated
// app.js understands:
//   { do: 'go' | 'swap' | 'overlay', to: screenDomId, fx?: { kind, ms, dir } }
//   { do: 'back' } | { do: 'close' } | { do: 'url', url } | { do: 'scroll', to: className }

const CLICK_TRIGGERS = new Set(['ON_CLICK', 'ON_PRESS'])

/**
 * @typedef {{ do: string, to?: string, url?: string, fx?: { kind: string, ms: number, dir?: string } }} Action
 * @typedef {{
 *   screenDomId: (nodeId: string) => string | null,
 *   nodeClass: (nodeId: string) => string,
 *   warn: (key: string, message: string) => void
 * }} ActionContext
 */

/**
 * @param {any} node
 * @param {ActionContext} ctx
 */
function actionsOf (node, ctx) {
  /** @type {Action[]} */
  let click = []
  /** @type {{ ms: number, act: Action[] } | null} */
  let timer = null
  /** @type {Array<{ codes: number[], act: Action[] }>} */
  const keys = []

  for (const interaction of node.interactions || []) {
    const trigger = interaction.trigger || {}
    const actions = mapActions(interaction.actions || (interaction.action ? [interaction.action] : []), ctx)
    if (!actions.length) continue

    if (CLICK_TRIGGERS.has(trigger.type)) {
      click = click.concat(actions)
    } else if (trigger.type === 'AFTER_TIMEOUT') {
      const seconds = typeof trigger.timeout === 'number' ? trigger.timeout : 0.8
      timer = { ms: Math.round(toMs(seconds)), act: actions }
    } else if (trigger.type === 'ON_KEY_DOWN' && Array.isArray(trigger.keyCodes) && trigger.keyCodes.length) {
      keys.push({ codes: trigger.keyCodes, act: actions })
    } else {
      ctx.warn('trigger:' + trigger.type, `Skipped interactions with the "${humanTrigger(trigger.type)}" trigger, only click, key press and after delay are supported.`)
    }
  }

  // Old files only have the single prototype link.
  if (!click.length && node.transitionNodeID) {
    const to = ctx.screenDomId(node.transitionNodeID)
    if (to) click.push({ do: 'go', to })
  }

  return { click, timer, keys }
}

/**
 * @param {any[]} list
 * @param {ActionContext} ctx
 * @returns {Action[]}
 */
function mapActions (list, ctx) {
  /** @type {Action[]} */
  const out = []
  for (const a of list) {
    if (!a) continue
    if (a.type === 'BACK') out.push({ do: 'back' })
    else if (a.type === 'CLOSE') out.push({ do: 'close' })
    else if (a.type === 'URL') {
      if (typeof a.url === 'string' && /^(https?:|mailto:)/i.test(a.url)) out.push({ do: 'url', url: a.url })
    } else if (a.type === 'NODE') {
      const mapped = nodeAction(a, ctx)
      if (mapped) out.push(mapped)
    } else {
      ctx.warn('action:' + a.type, `Skipped "${String(a.type).toLowerCase().replace(/_/g, ' ')}" actions, they aren't supported yet.`)
    }
  }
  return out
}

/**
 * @param {any} a
 * @param {ActionContext} ctx
 * @returns {Action | null}
 */
function nodeAction (a, ctx) {
  if (!a.destinationId) return null
  const nav = a.navigation || 'NAVIGATE'

  if (nav === 'SCROLL_TO') return { do: 'scroll', to: ctx.nodeClass(a.destinationId) }
  if (nav === 'CHANGE_TO') {
    ctx.warn('nav:CHANGE_TO', 'Skipped "change to" interactions (component variants), they aren\'t supported yet.')
    return null
  }

  const to = ctx.screenDomId(a.destinationId)
  if (!to) {
    ctx.warn('missing:' + a.destinationId, `A link points at a frame that isn't part of the app (${a.destinationId}), so it does nothing.`)
    return null
  }

  /** @type {Action} */
  const action = { do: nav === 'OVERLAY' ? 'overlay' : nav === 'SWAP' ? 'swap' : 'go', to }
  const fx = transition(a.transition)
  if (fx) action.fx = fx
  return action
}

/** @param {any} t */
function transition (t) {
  if (!t || !t.type) return null
  const ms = Math.min(3000, Math.max(0, Math.round(toMs(typeof t.duration === 'number' ? t.duration : 0.3))))
  if (!ms) return null
  switch (t.type) {
    case 'MOVE_IN':
    case 'PUSH':
    case 'SLIDE_IN':
      return { kind: 'slide', ms, dir: t.direction || 'LEFT' }
    case 'DISSOLVE':
    case 'SMART_ANIMATE':
    case 'MOVE_OUT':
    case 'SLIDE_OUT':
    case 'SCROLL_ANIMATE':
      return { kind: 'fade', ms }
    default:
      return null
  }
}

// The API has used both seconds and milliseconds over the years.
/** @param {number} value */
function toMs (value) {
  return value > 30 ? value : value * 1000
}

/** @param {string} type */
function humanTrigger (type) {
  return String(type || 'unknown').toLowerCase().replace(/^on_/, '').replace(/_/g, ' ')
}

module.exports = { actionsOf }
