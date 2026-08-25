import { chromium } from '@playwright/test'

/**
 * A quién le cuesta el fotograma, apagando capas de una en una.
 *
 * El perfil de CPU descartó el JavaScript: el hilo principal está ocioso el
 * 70 % del tiempo y aun así los fotogramas duran 52 ms. Eso sólo puede ser GPU
 * o composición, y ahí no hay perfilador que reparta culpas por función. La
 * forma honesta de medirlo es quitar una capa, volver a medir, y devolverla.
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.setDefaultTimeout(120000)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroCurtain === true', null, { timeout: 90000 })
await page.waitForTimeout(2000)

const measure = () => page.evaluate(() => new Promise((resolve) => {
  const times = []
  let last = performance.now()
  const start = last
  const step = () => {
    const now = performance.now()
    times.push(now - last)
    last = now
    if (now - start > 2500) {
      times.sort((a, b) => a - b)
      const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))]
      resolve({ fps: Math.round(1000 / at(0.5)), p50: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1) })
    } else requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}))

const apply = (css) => page.evaluate((rule) => {
  let tag = document.getElementById('blame')
  if (!tag) { tag = document.createElement('style'); tag.id = 'blame'; document.head.appendChild(tag) }
  tag.textContent = rule
}, css)

const cases = [
  ['completo                     ', ''],
  ['sin lienzo WebGL             ', '.hero-canvas{display:none!important}'],
  ['sin nieblas y velos DOM      ', '.fog-layer,[class*="ambient-fog"],[class*="fog-front"],.hero-vignette,.hero-veil{display:none!important}'],
  ['sin filtros CSS              ', '*{filter:none!important;backdrop-filter:none!important}'],
  ['sin cielo cinematográfico    ', '[class*="cinematic-sky"],[class*="scene-orbit"],[class*="beam-"],[class*="near-particles"]{display:none!important}'],
  ['sin lienzos de partículas    ', '.print-canvas{display:none!important}'],
  ['sólo el lienzo WebGL         ', '.hero-layout,.hero-data,.hero-portal,.section-rail,.hero-scroll-cue,.hero-vignette,.hero-veil{display:none!important}'],
]

for (const [label, css] of cases) {
  await apply(css)
  await page.waitForTimeout(700)
  const result = await measure()
  console.log(`${label} ${JSON.stringify(result)}`)
}
await apply('')

// ¿Y si el lienzo 3D renderiza a menos resolución?
for (const scale of [0.75, 0.5]) {
  await page.evaluate((factor) => {
    const canvas = document.querySelector('.hero-canvas canvas')
    if (!canvas) return
    canvas.width = Math.round(canvas.clientWidth * factor)
    canvas.height = Math.round(canvas.clientHeight * factor)
  }, scale)
  await page.waitForTimeout(700)
  console.log(`lienzo WebGL a ${scale}x        ${JSON.stringify(await measure())}`)
}

await context.close()
await browser.close()
