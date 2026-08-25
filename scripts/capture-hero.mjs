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
const DEBUG_SCENE = process.env.HERO_DEBUG === '1'
const REDUCED_SCENE = process.env.HERO_REDUCED === '1'
const REQUIRED_PROGRESS = [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.47, 0.55, 0.63, 0.71, 0.79, 0.87, 0.95, 0.98, 1]
const PROGRESS = process.env.HERO_POINTS
  ? process.env.HERO_POINTS.split(',').map(Number).filter(Number.isFinite)
  : REQUIRED_PROGRESS
const VIEWPORTS = process.env.HERO_VIEWPORT === 'mobile'
  ? [{ name: '390x844', width: 390, height: 844 }]
  : [
      { name: '1920x1080', width: 1920, height: 1080 },
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1366x768', width: 1366, height: 768 },
    ]

const only = process.argv.includes('--fast')
const viewports = only ? VIEWPORTS.slice(0, 1) : VIEWPORTS
const out = path.join(process.cwd(), 'tmp', 'hero-shots')
fs.mkdirSync(out, { recursive: true })

const renderer = process.env.HERO_RENDERER ?? (process.platform === 'win32' ? 'd3d11' : 'swiftshader')
const rendererArgs = renderer === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text']
  : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-lcd-text']
const browser = await chromium.launch({ args: rendererArgs })
const problems = []

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: REDUCED_SCENE ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`[${viewport.name}] consola: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`[${viewport.name}] excepción: ${error.message}`))

  page.setDefaultTimeout(180_000)
  page.setDefaultNavigationTimeout(180_000)
  // Una sola carga por viewport: los modelos se descargan y se miden una vez.
  await page.goto(`${BASE}/?heroTest=1&p=0${DEBUG_SCENE ? '&heroDebugScene=1' : ''}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.hero-canvas canvas')
  await page.waitForFunction('window.__heroReady === true')

  for (const p of PROGRESS) {
    const label = String(Math.round(p * 100)).padStart(3, '0')
    await page.evaluate((value) => window.__heroSetProgress(value), p)
    await page.evaluate((value) => window.__heroSetTime(value), p * 10)
    // Margen para que cámara, niebla y luces alcancen su valor amortiguado.
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    }))
    const prefix = DEBUG_SCENE ? 'hero-debug' : REDUCED_SCENE ? 'hero-reduced' : 'hero'
    const file = path.join(out, `${prefix}-${label}-${viewport.name}.png`)
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
