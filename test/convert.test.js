'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { analyze, emit, renderMode, linkedFrames } = require('../src/core/convert')
const { nodes } = require('./fixtures/sample-file')

const screens = [nodes['1:2'], nodes['2:1'], nodes['3:1']]

test('render modes', () => {
  assert.equal(renderMode({ type: 'TEXT' }), 'text')
  assert.equal(renderMode({ type: 'VECTOR' }), 'svg')
  assert.equal(renderMode({ type: 'RECTANGLE', rotation: 0.4 }), 'svg')
  assert.equal(renderMode({ type: 'FRAME', rotation: 0.4 }), 'png')
  assert.equal(renderMode({ type: 'FRAME', name: 'Chart @image' }), 'png')
  assert.equal(renderMode({ type: 'ELLIPSE', arcData: { startingAngle: 0, endingAngle: Math.PI, innerRadius: 0 } }), 'svg')
  assert.equal(renderMode({ type: 'ELLIPSE' }), 'box')
  assert.equal(renderMode({ type: 'FRAME', visible: false }), 'skip')
})

test('analyze finds renders, image fills and fonts', () => {
  const plan = analyze(screens)
  assert.deepEqual(plan.renders.svg.map((r) => r.id), ['1:6', '2:7'])
  assert.deepEqual(plan.renders.png.map((r) => r.id), ['2:40'])
  assert.deepEqual([...plan.imageRefs].sort(), ['avatar-ref', 'hero-ref'])
  assert.ok(plan.fonts.some((f) => f.family === 'Inter' && f.weight === 700))
  assert.ok(plan.fonts.some((f) => f.family === 'Inter' && f.weight === 600))
})

test('linked frames follow prototype links', () => {
  assert.deepEqual([...linkedFrames(nodes['1:2'])], ['2:1'])
  assert.deepEqual([...linkedFrames(nodes['2:1'])], ['3:1'])
})

function convert () {
  return emit({
    screens,
    imageUrl: (ref) => `assets/images/${ref}.png`,
    renderUrl: (cls, kind) => `assets/renders/${cls}.${kind}`
  })
}

test('screens, links and window controls end up in the markup', () => {
  const out = convert()
  assert.match(out.html, /<section class="screen" id="s-1-2" data-name="Sign in" hidden>/)
  assert.match(out.html, /data-act="\[\{&quot;do&quot;:&quot;go&quot;,&quot;to&quot;:&quot;s-2-1&quot;/)
  assert.match(out.html, /data-act="\[\{&quot;do&quot;:&quot;overlay&quot;,&quot;to&quot;:&quot;s-3-1&quot;/)
  assert.match(out.html, /data-act="\[\{&quot;do&quot;:&quot;back&quot;\}\]"/)
  assert.match(out.html, /data-win="close"/)
  assert.match(out.html, /class="n1-4 drag"/)
  assert.match(out.html, /data-backdrop="rgba\(15, 23, 42, 0.45\)" data-dismiss/)
  assert.deepEqual([...out.windowButtons], ['close'])
  assert.equal(out.hasDrag, true)
})

test('hidden layers are dropped', () => {
  assert.doesNotMatch(convert().html, /remove me/)
})

test('tagged frames become real inputs', () => {
  const { html, css } = convert()
  assert.match(html, /<input class="n1-10-f field" type="text" placeholder="you@example.com"/)
  assert.match(html, /<input class="n1-12-f field" type="password" placeholder="Password"/)
  assert.match(html, /class="n1-11 ph"/)
  assert.match(css, /\.n1-10-f \{\n {2}inset: 0;\n {2}padding: 0 14px;/)
})

test('text overrides become spans and links stay clickable', () => {
  const { html, css } = convert()
  assert.match(html, /<p>No account\? <span class="n1-16-s1 hot" data-act="[^"]+">Create one<\/span><\/p>/)
  assert.match(css, /\.n1-16-s1 \{\n {2}font-weight: 600;\n {2}color: #4f46e5;\n\}/)
})

test('auto layout and constraints show up in the CSS', () => {
  const { css } = convert()
  assert.match(css, /\.n1-7 \{[^}]*left: calc\(50% \+ 110px\);[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: 14px;[^}]*padding: 32px;/)
  assert.match(css, /\.n2-8 \{[^}]*left: 280px;[^}]*right: 40px;/)
  assert.match(css, /\.n2-10 \{[^}]*flex: 1 1 0;[^}]*align-self: stretch;/)
  assert.match(css, /\.n2-9 \{[^}]*right: 24px;[^}]*border-radius: 50%;/)
  assert.match(css, /\.n1-7::after \{[^}]*border-width: 1px;/)
})

test('unsupported interactions are reported, not dropped silently', () => {
  assert.ok(convert().warnings.some((w) => w.includes('change to')))
})

test('links to frames outside the app warn and do nothing', () => {
  const out = emit({ screens: [nodes['1:2']], imageUrl: () => null, renderUrl: () => null })
  assert.doesNotMatch(out.html, /&quot;go&quot;/)
  assert.ok(out.warnings.some((w) => w.includes("isn't part of the app")))
})

test('a text layer that is a link as a whole becomes clickable', () => {
  const frame = {
    id: '5:1',
    name: 'Links',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
    children: [
      {
        id: '5:2',
        name: 'Docs',
        type: 'TEXT',
        absoluteBoundingBox: { x: 10, y: 10, width: 80, height: 20 },
        characters: 'Read the docs',
        style: { fontFamily: 'Inter', fontSize: 14, hyperlink: { type: 'URL', url: 'https://example.com/docs' } }
      },
      {
        id: '5:3',
        name: 'Home',
        type: 'TEXT',
        absoluteBoundingBox: { x: 10, y: 40, width: 80, height: 20 },
        characters: 'Back home',
        style: { fontFamily: 'Inter', fontSize: 14, hyperlink: { type: 'NODE', nodeID: '5:1' } }
      }
    ]
  }
  const { html } = emit({ screens: [frame], imageUrl: () => null, renderUrl: () => null })
  assert.match(html, /class="n5-2 hot" data-act="\[\{&quot;do&quot;:&quot;url&quot;,&quot;url&quot;:&quot;https:\/\/example.com\/docs&quot;\}\]"/)
  assert.match(html, /class="n5-3 hot" data-act="\[\{&quot;do&quot;:&quot;go&quot;,&quot;to&quot;:&quot;s-5-1&quot;\}\]"/)
})
