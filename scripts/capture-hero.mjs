import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

/**
 * Capturas deterministas del capítulo «Inicio».
 *
 * Va contra `?heroTest=1&p=` para que el reloj, el puntero y las semillas de
 * partículas queden congelados: dos ejecuciones del mismo progreso producen la
 * misma imagen, que es lo único que permite comparar dos versiones de la
 * escena. Sin esto, cada captura caería en un instante distinto de la niebla.
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const PROGRESS = [0, 0.18, 0.35, 0.45, 0.52, 0.58, 0.64, 0.71, 0.78, 0.85, 0.97]
const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
]

const only = process.argv.includes('--fast')
const viewports = only ? VIEWPORTS.slice(0, 1) : VIEWPORTS
const out = path.join(process.cwd(), 'tmp', 'hero-shots')
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text'],
})
const problems = []

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`[${viewport.name}] consola: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`[${viewport.name}] excepción: ${error.message}`))

  page.setDefaultTimeout(180_000)
  page.setDefaultNavigationTimeout(180_000)
  // Una sola carga por viewport: los modelos se descargan y se miden una vez.
  await page.goto(`${BASE}/?heroTest=1&p=0`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.hero-canvas canvas')
  await page.waitForFunction('window.__heroReady === true')

  for (const p of PROGRESS) {
    const label = String(Math.round(p * 100)).padStart(3, '0')
    await page.evaluate((value) => window.__heroSetProgress(value), p)
    // Margen para que cámara, niebla y luces alcancen su valor amortiguado.
    await page.waitForTimeout(1600)
    const file = path.join(out, `hero-${label}-${viewport.name}.png`)
    await page.screenshot({ path: file, timeout: 180_000, animations: 'disabled', caret: 'hide' })
    console.log(`${path.basename(file)}`)
  }
  await context.close()
}

await browser.close()
if (problems.length) {
  console.log('\n--- incidencias en el navegador ---')
  for (const problem of [...new Set(problems)]) console.log(problem)
  process.exitCode = 1
} else {
  console.log('\nSin errores de consola ni excepciones.')
}
