import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Hoja de contacto del capítulo.
 *
 * Once fotogramas en una sola imagen. Mirarlos en secuencia es la única forma
 * de juzgar continuidad —si el cerebro crece o gira, si la niebla cambia de
 * plano, si la luz se mueve—; abriéndolos de uno en uno esas diferencias se
 * pierden entre pestaña y pestaña.
 *
 *   node scripts/contact-sheet.mjs 1920x1080 1440x900 1366x768
 */
const SHOTS = path.join(process.cwd(), 'tmp', 'hero-shots')
const PROGRESS = ['000', '018', '035', '045', '052', '058', '064', '071', '078', '085', '097']
const COLUMNS = 3
const CELL_WIDTH = 640
const GAP = 10
const LABEL = 30

for (const viewport of process.argv.slice(2)) {
  const files = PROGRESS.map((p) => ({ p, file: path.join(SHOTS, `hero-${p}-${viewport}.png`) }))
    .filter((entry) => fs.existsSync(entry.file))
  if (!files.length) {
    console.log(`· ${viewport}: sin capturas, se omite`)
    continue
  }

  const probe = await sharp(files[0].file).metadata()
  const cellHeight = Math.round((CELL_WIDTH * probe.height) / probe.width)
  const rows = Math.ceil(files.length / COLUMNS)
  const width = COLUMNS * CELL_WIDTH + (COLUMNS + 1) * GAP
  const height = rows * (cellHeight + LABEL) + (rows + 1) * GAP

  const composite = []
  for (const [index, entry] of files.entries()) {
    const column = index % COLUMNS
    const row = Math.floor(index / COLUMNS)
    const left = GAP + column * (CELL_WIDTH + GAP)
    const top = GAP + row * (cellHeight + LABEL + GAP)
    composite.push({
      input: await sharp(entry.file).resize(CELL_WIDTH, cellHeight, { fit: 'fill' }).toBuffer(),
      left,
      top,
    })
    // La etiqueta va como SVG para no depender de fuentes del sistema.
    const percent = String(Number(entry.p))
    composite.push({
      input: Buffer.from(
        `<svg width="${CELL_WIDTH}" height="${LABEL}"><rect width="100%" height="100%" fill="#0a1626"/>` +
        `<text x="10" y="21" font-family="monospace" font-size="17" fill="#7fe4ff">p = 0.${entry.p}` +
        `<tspan fill="#4f6f8a">   ·   ${percent} %</tspan></text></svg>`,
      ),
      left,
      top: top + cellHeight,
    })
  }

  const out = path.join(SHOTS, `contact-sheet-${viewport.split('x')[0]}.png`)
  await sharp({ create: { width, height, channels: 3, background: '#05101d' } })
    .composite(composite)
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`✓ ${path.basename(out)}  ${width}x${height}  ${files.length} fotogramas`)
}
