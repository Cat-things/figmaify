'use strict'

/** @param {string} name */
function slugify (name) {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'figma-app'
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/**
 * A name that's safe as a Windows file name, used for the exe.
 * @param {string} name
 */
function fileSafeName (name) {
  let out = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  if (!out || RESERVED.test(out)) out = 'App'
  return out
}

/** @param {string} version */
function isVersion (version) {
  return /^\d+\.\d+\.\d+$/.test(String(version || ''))
}

module.exports = { slugify, fileSafeName, isVersion }
