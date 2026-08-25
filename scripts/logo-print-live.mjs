import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

/**
 * La impresión con scroll de verdad, no con el progreso puesto a mano.
 *
 * El arnés determinista prueba la FORMA de cada fotograma; esto prueba su
 * DURACIÓN, que es el otro riesgo del efecto: la ventana de impresión mide unos
 * 110 px de scroll y sin el seguidor temporal de `ParticleLogo` un solo golpe
 * de rueda la atravesaría entera entre dos fotogramas.
 *
 * La rueda se manda por CDP crudo: `page.mouse.wheel` no reproduce el
 * comportamiento del ratón real en esta página.
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const out = path.join(process.cwd(), 'tmp', 'logo-print-live')
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-lcd-text'],
})
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const problems = []
page.on('console', (message) => { if (message.type() === 'error') problems.push(`consola: ${message.text()}`) })
page.on('pageerror', (error) => problems.push(`excepción: ${error.message}`))

page.setDefaultTimeout(180_000)
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true')
await page.waitForFunction("document.querySelectorAll('.print-host[data-print=\"live\"]').length === 12")

const cdp = await context.newCDPSession(page)
const heroProgress = () => page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--hero-progress') || 0))

// Hasta el borde mismo de la ventana de impresión, con golpes de rueda reales.
let guard = 0
while (await heroProgress() < 0.8 && guard < 400) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: 220, pointerType: 'mouse',
  })
  guard += 1
  await new Promise((resolve) => setTimeout(resolve, 24))
}
await new Promise((resolve) => setTimeout(resolve, 900))
console.log(`progreso al borde: ${(await heroProgress()).toFixed(4)} tras ${guard} golpes`)

/*
  Golpes sueltos hasta pasar el disparo, y PARADA EN SECO.

  Es el caso que se quiere probar: el usuario cruza el umbral y suelta la rueda.
  Con la impresión enganchada al progreso, ahí se quedaba a medias para siempre;
  con el interruptor, tiene que terminar sola.
*/
while (await heroProgress() < 0.855 && guard < 500) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: 200, pointerType: 'mouse',
  })
  guard += 1
  await new Promise((resolve) => setTimeout(resolve, 90))
}
console.log(`disparo cruzado en p=${(await heroProgress()).toFixed(4)}; rueda soltada`)

// Curva de la impresión medida DENTRO de la página: una captura de pantalla
// tarda cientos de milisegundos y falsearía la duración que se quiere medir.
const curve = await page.evaluate(() => new Promise((resolve) => {
  // Las dos marcas y un texto: el resto de piezas van con ellas.
  const nodes = [
    document.querySelector('.crest-image'),
    document.querySelector('.olbrox-image'),
    document.querySelector('.institutional-role'),
  ]
  const samples = []
  let frames = 0
  const count = () => { frames += 1; requestAnimationFrame(count) }
  requestAnimationFrame(count)
  const start = performance.now()
  const sample = () => {
    const at = performance.now() - start
    samples.push([Math.round(at), nodes.map((node) => Number(node.style.getPropertyValue('--print-reveal') || 0)), Math.round((frames * 1000) / Math.max(at, 1))])
    if (at > 4000) resolve(samples)
    else setTimeout(sample, 100)
  }
  sample()
}))
for (const [at, values, fps] of curve) {
  if (at % 400 > 110) continue
  console.log(`  ${String(at).padStart(4)} ms  escudo ${values[0].toFixed(2)}  olbrox ${values[1].toFixed(2)}  texto ${values[2].toFixed(2)}  (${fps} fps)`)
}

// Marcha atrás: por encima del disparo, la impresión tiene que deshacerse.
for (let back = 0; back < 14; back += 1) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: -200, pointerType: 'mouse',
  })
  await new Promise((resolve) => setTimeout(resolve, 60))
}
await new Promise((resolve) => setTimeout(resolve, 2600))
console.log(`marcha atrás a p=${(await heroProgress()).toFixed(4)} → reveal ${await page.evaluate(() => ['.crest-image', '.olbrox-image', '.institutional-role'].map((q) => document.querySelector(q).style.getPropertyValue('--print-reveal')).join(' / '))}`)

for (let shot = 0; shot < 3; shot += 1) {
  const file = path.join(out, `live-${String(shot).padStart(2, '0')}.png`)
  await page.locator('.hero-institutional').screenshot({ path: file, caret: 'hide' })
  console.log(`${path.basename(file)}  p=${(await heroProgress()).toFixed(4)}`)
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
