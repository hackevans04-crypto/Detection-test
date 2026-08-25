import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

/**
 * Prueba de scroll inverso.
 *
 * Toda la escena debe ser función del progreso, no de los eventos que la
 * llevaron hasta él. Si algo se dispara «una sola vez» —un pulso, una entrada,
 * un contador—, volver a un progreso ya visitado dará una imagen distinta y el
 * usuario que sube la rueda verá una escena rota.
 *
 * Aquí se llega al mismo progreso por dos caminos opuestos y se comparan los
 * píxeles. La diferencia debe ser prácticamente cero.
 *
 *   node scripts/reverse-test.mjs
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const OUT = path.join(process.cwd(), 'tmp', 'reverse')
const TARGETS = [0.22, 0.54, 0.78, 0.95]
// Ida y vuelta: se visita todo el recorrido antes de volver a cada objetivo.
const FORWARD = [0, ...TARGETS]
const BACKWARD = [1, ...[...TARGETS].reverse()]

fs.mkdirSync(OUT, { recursive: true })
const renderer = process.env.HERO_RENDERER ?? (process.platform === 'win32' ? 'd3d11' : 'swiftshader')
const rendererArgs = renderer === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text']
  : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-lcd-text']
const browser = await chromium.launch({ args: rendererArgs })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(240_000)
await page.goto(`${BASE}/?heroTest=1&p=0`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true')

async function walk(sequence, tag) {
  for (const value of sequence) {
    await page.evaluate((v) => window.__heroSetProgress(v), value)
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    }))
    if (!TARGETS.includes(value)) continue
    await page.screenshot({
      path: path.join(OUT, `${tag}-${String(Math.round(value * 100)).padStart(3, '0')}.png`),
      timeout: 240_000,
      animations: 'disabled',
    })
  }
}

await walk(FORWARD, 'ida')
await walk(BACKWARD, 'vuelta')
await browser.close()

console.log('progreso   diferencia media   veredicto')
let worst = 0
for (const value of TARGETS) {
  const label = String(Math.round(value * 100)).padStart(3, '0')
  const a = await sharp(path.join(OUT, `ida-${label}.png`)).raw().toBuffer()
  const b = await sharp(path.join(OUT, `vuelta-${label}.png`)).raw().toBuffer()
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  // Media sobre 0–255 por canal: es la unidad en la que «casi idéntico» se lee
  // sin tener que interpretar un porcentaje abstracto.
  const mean = sum / a.length
  worst = Math.max(worst, mean)
  console.log(`p=${value}      ${mean.toFixed(3).padStart(8)}/255      ${mean < 2 ? 'IDÉNTICO' : mean < 4 ? 'tolerable' : 'DIVERGE'}`)
}
console.log(`\nPeor diferencia: ${worst.toFixed(3)}/255`)
console.log(worst < 4
  ? 'REVERSE PASS: la escena es función del progreso en ambos sentidos.'
  : 'REVERSE FAIL: algún sistema depende del camino recorrido.')
process.exitCode = worst < 4 ? 0 : 1
