import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

/**
 * Tira de contactos de la impresión por partículas de los dos logotipos.
 *
 * Recorta al bloque institucional en lugar de fotografiar la pantalla entera:
 * lo que hay que juzgar aquí son dos cajas de 68×88 y 210×57, y en una captura
 * de 1920 no se distingue una partícula de un píxel del escudo.
 *
 * Va contra `?heroTest=1`, así que el reloj queda congelado y el seguidor
 * temporal de `ParticleLogo` se salta: cada progreso muestra EXACTAMENTE el
 * fotograma que le corresponde, sin inercia pendiente.
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const POINTS = process.env.HERO_POINTS
  ? process.env.HERO_POINTS.split(',').map(Number).filter(Number.isFinite)
  : [0.830, 0.838, 0.845, 0.852, 0.860, 0.868, 0.876, 0.884, 0.900, 0.928, 0.934, 0.938, 0.942, 0.946]

const out = path.join(process.cwd(), 'tmp', 'logo-print')
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-lcd-text'],
})
const reduced = process.env.HERO_REDUCED === '1'
const mobile = process.env.HERO_VIEWPORT === 'mobile'
const context = await browser.newContext({
  viewport: mobile ? { width: 430, height: 932 } : { width: 1600, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
})
const page = await context.newPage()
const problems = []
page.on('console', (message) => { if (message.type() === 'error') problems.push(`consola: ${message.text()}`) })
page.on('pageerror', (error) => problems.push(`excepción: ${error.message}`))

page.setDefaultTimeout(180_000)
page.setDefaultNavigationTimeout(180_000)
await page.goto(`${BASE}/?heroTest=1&p=0.83`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true')
// Se espera a las dos marcas y no a las doce piezas: en móvil los párrafos
// están en `display: none` y sus campos nunca llegan a construirse, que es el
// comportamiento correcto —no se imprime lo que no se ve—.
if (!reduced) await page.waitForFunction("document.querySelectorAll('.brand-image[data-print=\"live\"]').length === 2")

for (const p of POINTS) {
  await page.evaluate((value) => window.__heroSetProgress(value), p)
  await page.evaluate((value) => window.__heroSetTime(value), 12)
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }))
  const label = String(Math.round(p * 1000)).padStart(4, '0')
  const file = path.join(out, `print-${mobile ? 'm' : ''}${reduced ? 'r' : ''}${label}.png`)
  await page.locator('.hero-institutional').screenshot({ path: file, animations: 'disabled', caret: 'hide' })
  console.log(path.basename(file))
}

await context.close()
await browser.close()
if (problems.length) {
  console.log('\n--- incidencias en el navegador ---')
  for (const problem of [...new Set(problems)]) console.log(problem)
  process.exitCode = 1
} else {
  console.log('\nSin errores de consola ni excepciones.')
}
