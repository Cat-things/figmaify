'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createClient, FigmaApiError } = require('../src/core/figma-api')

/** @param {Array<{ status: number, body?: any, headers?: Record<string, string> }>} replies */
function fakeFetch (replies) {
  const seen = []
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
    seen.push({ url, init })
    const r = replies.shift() || { status: 500 }
    return /** @type {any} */ ({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (/** @type {string} */ name) => (r.headers || {})[name.toLowerCase()] || null },
      json: async () => r.body || {}
    })
  }
  return { fetch, seen }
}

const noWait = async () => {}

test('sends the token and reads JSON', async () => {
  const { fetch, seen } = fakeFetch([{ status: 200, body: { name: 'File' } }])
  const client = createClient({ token: 'figd_x', fetch, wait: noWait })
  assert.deepEqual(await client.getFileOutline('KEY'), { name: 'File' })
  assert.equal(seen[0].url, 'https://api.figma.com/v1/files/KEY?depth=3')
  assert.equal(seen[0].init.headers['X-Figma-Token'], 'figd_x')
})

test('waits out short rate limits', async () => {
  const waits = []
  const { fetch } = fakeFetch([{ status: 429, headers: { 'retry-after': '3' } }, { status: 200, body: { ok: 1 } }])
  const client = createClient({ token: 't', fetch, wait: async (ms) => { waits.push(ms) } })
  assert.deepEqual(await client.getNodes('KEY', ['1:2']), { ok: 1 })
  assert.deepEqual(waits, [3000])
})

test('long rate limits and bad tokens become readable errors', async () => {
  const limited = createClient({ token: 't', fetch: fakeFetch([{ status: 429, headers: { 'retry-after': '7200' } }]).fetch, wait: noWait })
  await assert.rejects(limited.getNodes('KEY', ['1:2']), (err) => err instanceof FigmaApiError && /about 2 hours/.test(err.message))

  const denied = createClient({ token: 't', fetch: fakeFetch([{ status: 403 }]).fetch, wait: noWait })
  await assert.rejects(denied.getFileOutline('KEY'), /file_content:read/)
})

test('renders go out in batches', async () => {
  const ids = Array.from({ length: 120 }, (_, i) => `1:${i}`)
  const replies = [0, 1, 2].map((b) => ({
    status: 200,
    body: { images: Object.fromEntries(ids.slice(b * 50, b * 50 + 50).map((id) => [id, 'https://x/' + id])) }
  }))
  const { fetch, seen } = fakeFetch(replies)
  const client = createClient({ token: 't', fetch, wait: noWait })
  const urls = await client.renderNodes('KEY', ids, { format: 'png', scale: 2 })
  assert.equal(seen.length, 3)
  assert.equal(Object.keys(urls).length, 120)
  assert.match(seen[0].url, /format=png&scale=2/)
})
