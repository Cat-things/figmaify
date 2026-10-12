'use strict'

// Figma hands out a few URL shapes for the same file:
//   https://www.figma.com/design/KEY/Name?node-id=1-2
//   https://www.figma.com/file/KEY/Name
//   https://www.figma.com/proto/KEY/Name?node-id=1-2
//   https://www.figma.com/design/KEY/Name/branch/BRANCHKEY/Name
// For branches the API wants the branch key, not the main file key.

const FILE_PATHS = new Set(['file', 'design', 'proto'])
const UNSUPPORTED_PATHS = {
  board: 'FigJam boards',
  slides: 'Figma Slides decks',
  make: 'Figma Make files',
  site: 'Figma Sites'
}

/**
 * @param {string} input
 * @returns {{ ok: true, fileKey: string, nodeId: string | null } | { ok: false, error: string }}
 */
function parseFigmaUrl (input) {
  const text = String(input || '').trim()
  if (!text) return { ok: false, error: 'Paste a Figma file link first.' }

  if (/^[A-Za-z0-9]{15,}$/.test(text)) {
    return { ok: true, fileKey: text, nodeId: null }
  }

  let url
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text)
  } catch {
    return { ok: false, error: 'That doesn\'t look like a link.' }
  }

  if (!/(^|\.)figma\.com$/i.test(url.hostname)) {
    return { ok: false, error: 'That isn\'t a figma.com link.' }
  }

  const parts = url.pathname.split('/').filter(Boolean)
  const kind = parts[0]

  if (kind in UNSUPPORTED_PATHS) {
    return { ok: false, error: `${UNSUPPORTED_PATHS[kind]} can't be converted, only design files.` }
  }
  if (!FILE_PATHS.has(kind) || !parts[1]) {
    return { ok: false, error: 'Couldn\'t find a file key in that link.' }
  }

  let fileKey = parts[1]
  const branchAt = parts.indexOf('branch')
  if (branchAt > 1 && parts[branchAt + 1]) fileKey = parts[branchAt + 1]

  return { ok: true, fileKey, nodeId: normalizeNodeId(url.searchParams.get('node-id')) }
}

// URLs use 12-34, the API uses 12:34.
/** @param {string | null} raw */
function normalizeNodeId (raw) {
  if (!raw) return null
  const id = decodeURIComponent(raw).replace(/-/g, ':')
  return /^\d+:\d+$/.test(id) ? id : null
}

module.exports = { parseFigmaUrl, normalizeNodeId }
