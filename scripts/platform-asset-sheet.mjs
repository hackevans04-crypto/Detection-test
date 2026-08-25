import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const directory = path.join(process.cwd(), 'tmp', 'silhouettes')
const downloads = 'C:/Users/PC/Downloads'
const files = fs.readdirSync(downloads)
  .filter((file) => /^Hi3D.*\.glb$/i.test(file))
  .map((file) => ({ file, modified: fs.statSync(path.join(downloads, file)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified)
  .slice(0, 15)
  .map(({ file }) => `${path.basename(file, '.glb')}-front.png`)
const columns = 3
const cell = 260
const label = 54
const gap = 10
const rows = Math.ceil(files.length / columns)
const width = columns * cell + (columns + 1) * gap
const height = rows * (cell + label) + (rows + 1) * gap
const layers = []

for (const [index, file] of files.entries()) {
  const column = index % columns
  const row = Math.floor(index / columns)
  const left = gap + column * (cell + gap)
  const top = gap + row * (cell + label + gap)
  layers.push({ input: await sharp(path.join(directory, file)).resize(cell, cell).png().toBuffer(), left, top })
  const short = file.replace(/^Hi3D_/, '').replace(/_allparts_/, ' · ').replace(/-front\.png$/i, '')
  const text = short.length > 42 ? `${short.slice(0, 39)}…` : short
  layers.push({ input: Buffer.from(`<svg width="${cell}" height="${label}"><rect width="100%" height="100%" fill="#071525"/><text x="9" y="22" font-family="monospace" font-size="12" fill="#8deeff">${text.replaceAll('&', '&amp;')}</text><text x="9" y="41" font-family="monospace" font-size="11" fill="#6989a1">${index + 1} / ${files.length}</text></svg>`), left, top: top + cell })
}

const output = path.join(directory, 'platform-assets-contact-sheet.png')
await sharp({ create: { width, height, channels: 3, background: '#020914' } }).composite(layers).png().toFile(output)
console.log(output)
