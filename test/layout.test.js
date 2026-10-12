'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { absolute, flexItem, flexContainer } = require('../src/core/convert/layout')

const parent = { w: 1000, h: 600 }
const box = { x: 100, y: 50, w: 200, h: 80 }
const place = (horizontal, vertical) => Object.fromEntries(absolute({ constraints: { horizontal, vertical } }, box, parent, { h: false, v: false }))

test('constraints become anchored positions', () => {
  assert.deepEqual(place('LEFT', 'TOP'), { position: 'absolute', left: '100px', width: '200px', top: '50px', height: '80px' })
  assert.deepEqual(place('RIGHT', 'BOTTOM'), { position: 'absolute', right: '700px', width: '200px', bottom: '470px', height: '80px' })
  assert.deepEqual(place('LEFT_RIGHT', 'TOP_BOTTOM'), { position: 'absolute', left: '100px', right: '700px', top: '50px', bottom: '470px' })
  assert.deepEqual(place('CENTER', 'SCALE'), { position: 'absolute', left: 'calc(50% - 400px)', width: '200px', top: '8.333%', height: '13.333%' })
})

test('fill, hug and fixed children in auto layout', () => {
  const row = { layoutMode: 'HORIZONTAL', itemSpacing: 8 }
  const fill = Object.fromEntries(flexItem({ layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FILL' }, row, box, 0))
  assert.deepEqual(fill, { position: 'relative', flex: '1 1 0', 'min-width': '0', 'align-self': 'stretch' })

  const fixed = Object.fromEntries(flexItem({ layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG' }, row, box, 1))
  assert.deepEqual(fixed, { position: 'relative', width: '200px', 'flex-shrink': '0' })
})

test('negative spacing turns into margins', () => {
  const row = { layoutMode: 'HORIZONTAL', itemSpacing: -12 }
  const decls = Object.fromEntries(flexItem({ layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED' }, row, box, 1))
  assert.equal(decls['margin-left'], '-12px')
  assert.equal(Object.fromEntries(flexContainer(row)).gap, undefined)
})

test('auto layout containers', () => {
  const decls = Object.fromEntries(flexContainer({
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'SPACE_BETWEEN',
    counterAxisAlignItems: 'CENTER',
    itemSpacing: 10,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 24,
    paddingRight: 24
  }))
  assert.deepEqual(decls, {
    display: 'flex',
    'flex-direction': 'column',
    'justify-content': 'space-between',
    'align-items': 'center',
    padding: '16px 24px'
  })
})
