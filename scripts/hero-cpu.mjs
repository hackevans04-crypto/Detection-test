import { chromium } from '@playwright/test'

/**
 * Atribución de CPU del capítulo «Inicio», por función.
 *
 * El perfil de fotogramas dice que el hilo principal no llega; esto dice quién
 * lo ocupa. Sin este paso, optimizar es adivinar: en una escena con WebGL,
 * postproceso, GSAP, Lenis y doce lienzos de partículas hay al menos cinco
 * candidatos plausibles y sólo uno suele pesar de verdad.
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const AT = Number(process.env.HERO_AT ?? 0)

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.setDefaultTimeout(120000)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroCurtain === true', null, { timeout: 90000 })

if (AT > 0) {
  const cdpScroll = await context.newCDPSession(page)
  for (let i = 0; i < 200; i += 1) {
    const p = await page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--hero-progress') || 0))
    if (p >= AT) break
    await cdpScroll.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: 140, pointerType: 'mouse' })
    await page.waitForTimeout(60)
  }
}
await page.waitForTimeout(1200)

const cdp = await context.newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.waitForTimeout(5000)
const { profile } = await cdp.send('Profiler.stop')

const byNode = new Map(profile.nodes.map((node) => [node.id, node]))
const self = new Map()
for (const id of profile.samples ?? []) {
  const node = byNode.get(id)
  if (!node) continue
  const call = node.callFrame
  const file = (call.url || '').split('/').slice(-1)[0].split('?')[0] || '(anónimo)'
  const key = `${call.functionName || '(anónimo)'}  ${file}:${call.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + 1)
}
const total = (profile.samples ?? []).length || 1
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)

console.log(`progreso ${AT} · ${total} muestras en ${((profile.endTime - profile.startTime) / 1e6).toFixed(1)} s\n`)
for (const [key, count] of rows) {
  const share = (count / total) * 100
  if (share < 0.8) continue
  console.log(`${share.toFixed(1).padStart(5)} %  ${key}`)
}

await context.close()
await browser.close()
