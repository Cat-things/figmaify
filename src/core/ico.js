'use strict'

// Windows has read PNG compressed .ico entries since Vista, so building an
// icon is just a header, a directory and the PNG files back to back.

/**
 * @param {Array<{ size: number, png: Buffer }>} images
 * @returns {Buffer}
 */
function pngsToIco (images) {
  const sorted = images.slice().sort((a, b) => a.size - b.size)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sorted.length, 4)

  const entries = []
  let offset = 6 + sorted.length * 16
  for (const { size, png } of sorted) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...sorted.map((i) => i.png)])
}

/** @param {Buffer} buf */
function isIco (buf) {
  return buf.length > 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1
}

module.exports = { pngsToIco, isIco }
