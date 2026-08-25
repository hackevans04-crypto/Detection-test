import { chromium } from '@playwright/test'

/**
 * Perfil de rendimiento y de tacto del capítulo «Inicio».
 *
 * Mide tres cosas distintas que se confunden bajo la misma queja de «va lento»:
 *
 * 1. **Fotogramas.** Si el hilo principal no llega a 60 Hz, cualquier scroll se
 *    siente pastoso por mucho que el control esté bien ajustado.
 * 2. **Distancia.** Cuántas muescas de rueda cuesta recorrer el capítulo. Es un
 *    número de diseño, no de rendimiento, y se percibe igual de lento.
 * 3. **Latencia.** Cuánto tarda la escena en moverse desde que llega la rueda,
 *    y cuánto sigue moviéndose después de soltarla —el arrastre—.
 *
 * Sin separarlas no se puede saber qué hay que arreglar.
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const WIDTH = Number(process.env.HERO_W ?? 1600)
const HEIGHT = Number(process.env.HERO_H ?? 900)

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.setDefaultTimeout(120000)

await page.goto(`${BASE}/?heroDebug=1`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroCurtain === true', null, { timeout: 90000 })
await page.waitForTimeout(1500)

const cdp = await context.newCDPSession(page)
const progress = () => page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--hero-progress') || 0))

/** Reparte los tiempos de fotograma en percentiles: la media esconde los tirones. */
const frames = (label, ms) => page.evaluate(async (duration) => {
  const times = []
  let last = performance.now()
  await new Promise((resolve) => {
    const step = () => {
      const now = performance.now()
      times.push(now - last)
      last = now
      if (now - times.start > duration) resolve()
      else requestAnimationFrame(step)
    }
    times.start = performance.now()
    requestAnimationFrame(step)
  })
  times.sort((a, b) => a - b)
  const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))]
  return {
    n: times.length,
    fps: Math.round(1000 / at(0.5)),
    p50: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    worst: +times[times.length - 1].toFixed(1),
    long: times.filter((t) => t > 33).length,
  }
}, ms)

const panel = () => page.evaluate(() => {
  const node = document.querySelector('.hero-debug')
  if (!node) return {}
  const out = {}
  for (const line of node.innerText.split('\n')) {
    const tier = line.match(/tier (\w+) · DPR ([\d.]+) · render (\d+)/)
    if (tier) { out.tier = tier[1]; out.dpr = Number(tier[2]); out.render = tier[3] + '%' }
    const draw = line.match(/calls (\d+) · tris ([\d.,]+)/)
    if (draw) { out.calls = Number(draw[1]); out.tris = draw[2] }
  }
  return out
})

const notch = (deltaY) => cdp.send('Input.dispatchMouseEvent', {
  type: 'mouseWheel', x: WIDTH / 2, y: HEIGHT / 2, deltaX: 0, deltaY, pointerType: 'mouse',
})

console.log('escena  ', JSON.stringify(await panel()))
console.log('quieto  ', JSON.stringify(await frames('idle', 2000)))

// --- distancia: muescas sueltas, al ritmo de alguien leyendo
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(900)
let notches = 0
const t0 = Date.now()
while (await progress() < 0.995 && notches < 400) {
  await notch(100)
  notches += 1
  await page.waitForTimeout(70)
}
console.log(`distancia  ${notches} muescas de 100 px · ${((Date.now() - t0) / 1000).toFixed(1)} s hasta p=${(await progress()).toFixed(3)}`)

// --- fotogramas mientras se scrollea de verdad
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(900)
const sweep = page.evaluate(async () => {
  const times = []
  let last = performance.now()
  const start = last
  await new Promise((resolve) => {
    const step = () => {
      const now = performance.now()
      times.push(now - last)
      last = now
      if (now - start > 4000) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  times.sort((a, b) => a - b)
  const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))]
  return { fps: Math.round(1000 / at(0.5)), p50: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1), long: times.filter((t) => t > 33).length }
})
for (let i = 0; i < 40; i += 1) { await notch(120); await page.waitForTimeout(90) }
console.log('scroll  ', JSON.stringify(await sweep))

// --- latencia y arrastre
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(900)
const before = await progress()
const lag = await page.evaluate(() => new Promise((resolve) => {
  const from = Number(document.documentElement.style.getPropertyValue('--hero-progress') || 0)
  const start = performance.now()
  let moved = 0
  const step = () => {
    const value = Number(document.documentElement.style.getPropertyValue('--hero-progress') || 0)
    if (!moved && Math.abs(value - from) > 0.0004) moved = performance.now() - start
    if (performance.now() - start > 1600) resolve({ moved: Math.round(moved), settled: value })
    else requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}))
await notch(120)
const settled = await lag
console.log(`latencia  primer movimiento ${settled.moved} ms · una muesca avanza ${(settled.settled - before).toFixed(4)} de progreso`)
// La resolución dinámica tarda un par de segundos en decidirse: leerla al
// principio sólo dice con qué arrancó, no dónde se ha asentado.
console.log('asentado', JSON.stringify(await panel()))

await context.close()
await browser.close()
