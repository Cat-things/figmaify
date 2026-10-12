'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseFigmaUrl } = require('../src/core/figma-url')

test('design links give the file key and node id', () => {
  const r = parseFigmaUrl('https://www.figma.com/design/AbCdEf123456/My-App?node-id=12-34&t=xyz')
  assert.deepEqual(r, { ok: true, fileKey: 'AbCdEf123456', nodeId: '12:34' })
})

test('old file and proto links still work', () => {
  assert.equal(/** @type {any} */ (parseFigmaUrl('https://figma.com/file/KEY123/Name')).fileKey, 'KEY123')
  assert.equal(/** @type {any} */ (parseFigmaUrl('figma.com/proto/KEY456/Name?node-id=1-2')).nodeId, '1:2')
})

test('branch links use the branch key', () => {
  const r = parseFigmaUrl('https://www.figma.com/design/MAINKEY/Name/branch/BRANCHKEY/Name')
  assert.equal(/** @type {any} */ (r).fileKey, 'BRANCHKEY')
})

test('a bare key is accepted', () => {
  assert.equal(/** @type {any} */ (parseFigmaUrl('aBcDeFgHiJkLmNoPqRsT')).fileKey, 'aBcDeFgHiJkLmNoPqRsT')
})

test('FigJam, other sites and junk are rejected with a reason', () => {
  for (const input of ['https://www.figma.com/board/KEY/Name', 'https://example.com/design/KEY', '', 'https://www.figma.com/files/recent']) {
    const r = parseFigmaUrl(input)
    assert.equal(r.ok, false, input)
    assert.ok(/** @type {any} */ (r).error.length > 0)
  }
})
