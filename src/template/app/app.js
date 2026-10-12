'use strict'

// Screen switching for the converted design.
// Clickable layers carry their prototype actions in data-act as JSON,
// delayed actions in data-timer and keyboard shortcuts in data-keys.

const stack = []
const overlays = []
const timers = new Map()
let current = null

const SLIDE_FROM = { LEFT: [100, 0], RIGHT: [-100, 0], TOP: [0, 100], BOTTOM: [0, -100] }
const MODIFIERS = { 16: 'shiftKey', 17: 'ctrlKey', 18: 'altKey', 91: 'metaKey' }

function byId (id) {
  return id ? document.getElementById(id) : null
}

function topLayer () {
  return overlays[overlays.length - 1] || current
}

function show (id, fx) {
  const next = byId(id)
  if (!next || next === current) return false
  closeAllOverlays()
  if (current) leave(current)
  next.hidden = false
  current = next
  play(next, fx)
  enter(next)
  return true
}

function go (id, fx) {
  const from = current
  if (show(id, fx) && from) stack.push(from.id)
}

function back () {
  if (overlays.length) return closeOverlay()
  const id = stack.pop()
  if (id) show(id, { kind: 'fade', ms: 150 })
}

function swap (id, fx) {
  if (overlays.length) {
    closeOverlay()
    openOverlay(id, fx)
  } else {
    show(id, fx)
  }
}

function openOverlay (id, fx) {
  const el = byId(id)
  if (!el || el === current || overlays.includes(el)) return
  el.classList.add('as-overlay')
  el.style.zIndex = String(10 + overlays.length)
  if (el.dataset.backdrop) el.style.backgroundColor = el.dataset.backdrop
  el.hidden = false
  overlays.push(el)
  play(el.firstElementChild, fx)
  enter(el)
}

function closeOverlay () {
  const el = overlays.pop()
  if (!el) return
  leave(el)
  el.classList.remove('as-overlay')
  el.style.zIndex = ''
  el.style.backgroundColor = ''
}

function closeAllOverlays () {
  while (overlays.length) closeOverlay()
}

// Start "after delay" timers when a screen or overlay shows up.
function enter (el) {
  const ids = []
  for (const node of el.querySelectorAll('[data-timer]')) {
    const { ms, act } = JSON.parse(node.dataset.timer)
    ids.push(setTimeout(() => run(act), ms))
  }
  timers.set(el, ids)
}

function leave (el) {
  el.hidden = true
  for (const id of timers.get(el) || []) clearTimeout(id)
  timers.delete(el)
}

function play (el, fx) {
  if (!el || !fx || !fx.ms) return
  if (fx.kind === 'slide') {
    const [x, y] = SLIDE_FROM[fx.dir] || SLIDE_FROM.LEFT
    el.animate(
      [{ transform: `translate(${x}%, ${y}%)` }, { transform: 'none' }],
      { duration: fx.ms, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
    )
  } else {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fx.ms, easing: 'ease-out' })
  }
}

function run (actions) {
  for (const a of actions) {
    switch (a.do) {
      case 'go': go(a.to, a.fx); break
      case 'swap': swap(a.to, a.fx); break
      case 'overlay': openOverlay(a.to, a.fx); break
      case 'back': back(); break
      case 'close': closeOverlay(); break
      case 'url': window.open(a.url); break
      case 'scroll': {
        const layer = topLayer()
        const target = layer && layer.querySelector('.' + CSS.escape(a.to))
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }
}

function keyMatches (codes, event) {
  const keys = codes.filter((code) => !MODIFIERS[code])
  if (!keys.includes(event.keyCode)) return false
  return codes.every((code) => !MODIFIERS[code] || event[MODIFIERS[code]])
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const win = target.closest('[data-win]')
  if (win) {
    if (window.desktop) window.desktop.window(win.dataset.win)
    return
  }

  const hot = target.closest('[data-act]')
  if (hot) {
    run(JSON.parse(hot.dataset.act))
    return
  }

  const layer = overlays[overlays.length - 1]
  if (layer && target === layer && layer.hasAttribute('data-dismiss')) closeOverlay()
})

document.addEventListener('keydown', (event) => {
  const target = event.target
  if (target instanceof HTMLElement && target.matches('[role="button"]') && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    target.click()
    return
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return

  const layer = topLayer()
  if (layer) {
    for (const node of layer.querySelectorAll('[data-keys]')) {
      for (const entry of JSON.parse(node.dataset.keys)) {
        if (keyMatches(entry.codes, event)) {
          run(entry.act)
          return
        }
      }
    }
  }

  if (event.key === 'Escape' && overlays.length) closeOverlay()
})

show(document.body.dataset.start)
