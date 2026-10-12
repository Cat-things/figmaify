'use strict'

const SCREEN_TYPES = new Set(['FRAME', 'COMPONENT', 'INSTANCE'])

/**
 * @typedef {{ id: string, name: string, width: number, height: number, section: string | null }} FrameInfo
 * @typedef {{ id: string, name: string, frames: FrameInfo[] }} PageInfo
 */

/**
 * Pages and the top level frames on them, from a depth limited file fetch.
 * Frames sitting inside sections count as top level too.
 * @param {any} file
 */
function outlineOf (file) {
  if (file.editorType && file.editorType !== 'figma') {
    throw new Error('Only Figma design files can be converted, this one is a ' + file.editorType + ' file.')
  }

  /** @type {PageInfo[]} */
  const pages = []
  /** @type {string[]} */
  const starts = []

  for (const page of (file.document && file.document.children) || []) {
    if (page.type !== 'CANVAS') continue
    /** @type {FrameInfo[]} */
    const frames = []

    /** @param {any} node @param {string | null} section */
    const add = (node, section) => {
      if (node.visible === false || !SCREEN_TYPES.has(node.type) || !node.absoluteBoundingBox) return
      frames.push({
        id: node.id,
        name: node.name,
        width: Math.round(node.absoluteBoundingBox.width),
        height: Math.round(node.absoluteBoundingBox.height),
        section
      })
    }

    for (const node of page.children || []) {
      if (node.type === 'SECTION' && node.visible !== false) {
        for (const child of node.children || []) add(child, node.name)
      } else {
        add(node, null)
      }
    }

    for (const flow of page.flowStartingPoints || []) {
      if (flow && flow.nodeId) starts.push(flow.nodeId)
    }

    pages.push({ id: page.id, name: page.name, frames })
  }

  return {
    name: file.name || 'Untitled',
    version: file.version ? String(file.version) : null,
    lastModified: file.lastModified || null,
    pages,
    starts
  }
}

module.exports = { outlineOf }
