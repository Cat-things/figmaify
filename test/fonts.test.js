'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { bundleGoogleFonts, cssUrl } = require('../src/core/fonts')

const faceCss = (weight) => `@font-face {
  font-family: 'Inter';
  font-weight: ${weight};
  src: url(https://fonts.gstatic.com/s/inter/v20/inter-${weight}.woff2) format('woff2');
}`

test('urls list variants the way Google wants them', () => {
  assert.equal(
    cssUrl('Open Sans', ['0,400', '1,700']),
    'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;1,700&display=swap'
  )
})

test('downloads font files and points the CSS at local copies', async () => {
  const requested = []
  const saved = []
  const result = await bundleGoogleFonts([
    { family: 'Inter', weight: 700, italic: false },
    { family: 'Inter', weight: 400, italic: false },
    { family: 'Inter', weight: 450, italic: false },
    { family: 'Brand Sans', weight: 400, italic: false }
  ], {
    fetchText: async (url) => {
      requested.push(url)
      if (url.includes('Brand')) return null
      // One weight Google doesn't have fails the combined request.
      if (url.includes('450')) return url.includes(';') ? null : null
      if (url.includes('0,400')) return faceCss(400)
      if (url.includes('0,700')) return faceCss(700)
      return null
    },
    download: async (url) => Buffer.from(url),
    save: async (name) => {
      saved.push(name)
      return `assets/fonts/${name}`
    }
  })

  assert.deepEqual(result.bundled, ['Inter'])
  assert.deepEqual(result.missing, ['Brand Sans'])
  assert.deepEqual(saved, ['inter-0.woff2', 'inter-1.woff2'])
  assert.match(result.css, /url\("assets\/fonts\/inter-0.woff2"\)/)
  assert.doesNotMatch(result.css, /gstatic/)
  assert.ok(requested[0].includes('ital,wght@0,400;0,450;0,700'), 'variants are sorted')
})
