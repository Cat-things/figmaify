'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { color } = require('../src/core/convert/units')
const { background, linearGradient, strokeOf, effectsOf, radiusOf } = require('../src/core/convert/paint')

const red = { r: 1, g: 0, b: 0, a: 1 }
const blue = { r: 0, g: 0, b: 1, a: 1 }

test('colors come out as hex, or rgba when see through', () => {
  assert.equal(color(red), '#ff0000')
  assert.equal(color(red, 0.5), 'rgba(255, 0, 0, 0.5)')
  assert.equal(color({ r: 0, g: 0, b: 0, a: 0.25 }), 'rgba(0, 0, 0, 0.25)')
})

test('a top to bottom gradient maps to 180deg with stops in place', () => {
  const g = linearGradient({
    gradientHandlePositions: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 0 }],
    gradientStops: [{ color: red, position: 0 }, { color: blue, position: 1 }]
  }, { w: 200, h: 100 })
  assert.equal(g, 'linear-gradient(180deg, #ff0000 0%, #0000ff 100%)')
})

test('a gradient that starts inside the box gets shifted stops', () => {
  const g = linearGradient({
    gradientHandlePositions: [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0, y: 0 }],
    gradientStops: [{ color: red, position: 0 }, { color: blue, position: 1 }]
  }, { w: 100, h: 100 })
  assert.equal(g, 'linear-gradient(90deg, #ff0000 25%, #0000ff 75%)')
})

test('fills stack top first and the bottom solid becomes the base color', () => {
  const bg = background([
    { type: 'SOLID', color: red },
    { type: 'IMAGE', imageRef: 'abc', scaleMode: 'FIT' },
    { type: 'SOLID', color: blue, visible: false }
  ], { w: 10, h: 10 }, (ref) => `assets/images/${ref}.png`)
  assert.equal(bg, 'url("assets/images/abc.png") center / contain no-repeat, #ff0000')
})

test('missing images are left out instead of breaking the rule', () => {
  assert.equal(background([{ type: 'IMAGE', imageRef: 'gone' }], { w: 1, h: 1 }, () => null), null)
})

test('strokes, shadows and radii', () => {
  const stroke = strokeOf({ strokes: [{ type: 'SOLID', color: red }], strokeWeight: 2, strokeAlign: 'OUTSIDE' })
  assert.deepEqual(stroke, { color: '#ff0000', align: 'OUTSIDE', dashed: false, sides: [2, 2, 2, 2] })
  assert.equal(strokeOf({ strokes: [], strokeWeight: 2 }), null)

  const fx = effectsOf({
    effects: [
      { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.5 }, offset: { x: 0, y: 4 }, radius: 8, spread: 1 },
      { type: 'LAYER_BLUR', radius: 10 },
      { type: 'BACKGROUND_BLUR', radius: 20, visible: false }
    ]
  }, false)
  assert.deepEqual(fx, { shadows: ['0 4px 8px 1px rgba(0, 0, 0, 0.5)'], filter: 'blur(5px)', backdrop: '' })

  assert.equal(radiusOf({ cornerRadius: 8 }), '8px')
  assert.equal(radiusOf({ rectangleCornerRadii: [4, 4, 0, 0] }), '4px 4px 0 0')
  assert.equal(radiusOf({}), null)
})
