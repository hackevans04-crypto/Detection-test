import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

/**
 * Hoja de contacto de TODOS los GLB disponibles.
 *
 * Existe porque los nombres de archivo mienten y ya nos ha costado tiempo: en
 * este proyecto hay un `brain-stem` que es un cerebro entero y un
 * `neural-cluster` que es una placa, no un volumen. La única forma honesta de
 * elegir el modelo maestro es MIRARLOS.
 *
 * Las siluetas las produce `glb-silhouette.mjs` proyectando densidad de
 * vértices, sin WebGL: son 26 modelos de ~62 MB y ~2 M de triángulos cada uno,
 * y levantar un contexto GPU para cada uno costaría más que el análisis. Lo que
 * se busca aquí es la FORMA, y para eso la proyección basta.
 *
 * Se compone en HTML y se fotografía porque así las etiquetas y las medidas
 * viajan con la imagen. Una rejilla de PNG sueltos obliga a cruzar la hoja con
 * una tabla aparte, que es justo lo que hace que se vuelva a confiar en el
 * nombre del archivo.
 */
const SILHOUETTES = path.join(process.cwd(), 'tmp', 'silhouettes')
const OUT = path.join(process.cwd(), 'tmp', 'platform-audit')
fs.mkdirSync(OUT, { recursive: true })

const measures = new Map()
const log = path.join(process.cwd(), 'tmp', 'silhouette-log.txt')
if (fs.existsSync(log)) {
  for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
    const match = line.match(/^(.+): W=([\d.]+) H=([\d.]+) D=([\d.]+)\s+ratio H\/W=([\d.]+)/)
    if (match) measures.set(match[1], { w: match[2], h: match[3], d: match[4], ratio: match[5] })
  }
}

const models = [...new Set(fs.readdirSync(SILHOUETTES)
  .filter((file) => file.endsWith('-front.png'))
  .map((file) => file.replace(/-front\.png$/, '')))].sort()

/** Nombre corto legible: el prefijo `Hi3D_` y el sufijo de fecha no aportan. */
const label = (name) => name
  .replace(/^Hi3D_/, '')
  .replace(/_allparts_\d+$/, '')
  .replace(/ Modelo 3D$/, '')
  .replace(/^Modelo 3D (de |)/, '')

const dataUri = (file) => {
  const full = path.join(SILHOUETTES, file)
  if (!fs.existsSync(full)) return ''
  return `data:image/png;base64,${fs.readFileSync(full).toString('base64')}`
}

const cards = models.map((name) => {
  const size = measures.get(name)
  return `
  <figure>
    <div class="views">
      <img src="${dataUri(`${name}-front.png`)}" alt="frente">
      <img src="${dataUri(`${name}-side.png`)}" alt="lateral">
      <img src="${dataUri(`${name}-top.png`)}" alt="planta">
    </div>
    <figcaption>
      <strong>${label(name)}</strong>
      <span>${size ? `${size.w} × ${size.h} × ${size.d} · H/W ${size.ratio}` : 'sin medidas'}</span>
    </figcaption>
  </figure>`
}).join('')

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px; background: #030a16; color: #dce9f7;
         font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: .01em; }
  p.lead { margin: 0 0 22px; color: #7f9bbb; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  figure { margin: 0; border: 1px solid rgba(90,170,235,.22); border-radius: 10px;
           overflow: hidden; background: rgba(10,26,48,.55); }
  .views { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: rgba(90,170,235,.16); }
  .views img { display: block; width: 100%; height: auto; background: #04101f; }
  figcaption { padding: 9px 11px 11px; }
  figcaption strong { display: block; font-size: 12px; color: #eaf4ff; }
  figcaption span { display: block; margin-top: 3px; font-size: 11px; color: #6f8fb2; font-variant-numeric: tabular-nums; }
</style>
<h1>GLB disponibles · frente / lateral / planta</h1>
<p class="lead">${models.length} modelos. Proyección de densidad de vértices — silueta real, no el nombre del archivo.</p>
<div class="grid">${cards}</div>`

const file = path.join(OUT, 'contact-sheet.html')
fs.writeFileSync(file, html)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })).newPage()
await page.goto(`file://${file.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' })
await page.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true })
await browser.close()
console.log(`${models.length} modelos → tmp/platform-audit/contact-sheet.png`)
