'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { plan, nextVersion } = require('../scripts/release-plan')

const main = { event: 'push', ref: 'refs/heads/main', pkgVersion: '0.1.0' }

test('main releases once it has 5 commits since the last release', () => {
  assert.equal(plan({ ...main, lastTag: '', commitsSince: 4 }).release, false)
  assert.deepEqual(plan({ ...main, lastTag: '', commitsSince: 5 }), { release: true, version: '0.1.0', tag: 'v0.1.0' })
  assert.deepEqual(plan({ ...main, lastTag: 'v0.1.0', commitsSince: 7 }), { release: true, version: '0.1.1', tag: 'v0.1.1' })
  assert.equal(plan({ ...main, lastTag: 'v0.1.0', commitsSince: 0 }).release, false)
})

test('other branches and pull requests never release', () => {
  assert.equal(plan({ ...main, ref: 'refs/heads/feature', lastTag: '', commitsSince: 50 }).release, false)
  assert.equal(plan({ ...main, event: 'pull_request', lastTag: '', commitsSince: 50 }).release, false)
})

test('a hand pushed tag releases as that version', () => {
  assert.deepEqual(
    plan({ event: 'push', ref: 'refs/tags/v2.0.0', pkgVersion: '0.1.0', lastTag: 'v0.1.3', commitsSince: 1 }),
    { release: true, version: '2.0.0', tag: 'v2.0.0' }
  )
  assert.throws(() => plan({ event: 'push', ref: 'refs/tags/v2', pkgVersion: '0.1.0', lastTag: '', commitsSince: 1 }))
})

test('versions bump the patch unless package.json is ahead', () => {
  assert.equal(nextVersion('0.1.0', ''), '0.1.0')
  assert.equal(nextVersion('0.1.0', 'v0.1.4'), '0.1.5')
  assert.equal(nextVersion('0.2.0', 'v0.1.4'), '0.2.0')
  assert.equal(nextVersion('0.1.2', 'v0.1.2'), '0.1.3')
})
