'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { pngsToIco, isIco } = require('../src/core/ico')

test('packs PNGs into an ico with a correct directory', () => {
  const small = Buffer.from('small-png')
  const big = Buffer.from('big-png-data')
  const ico = pngsToIco([{ size: 256, png: big }, { size: 16, png: small }])

  assert.ok(isIco(ico))
  assert.equal(ico.readUInt16LE(4), 2)
  assert.equal(ico.readUInt8(6), 16, 'smallest first')
  assert.equal(ico.readUInt8(6 + 16), 0, '256 is stored as 0')

  const offset = ico.readUInt32LE(6 + 16 + 12)
  const length = ico.readUInt32LE(6 + 16 + 8)
  assert.equal(ico.subarray(offset, offset + length).toString(), 'big-png-data')
})
