import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const out = path.join(process.cwd(), 'tmp', 'platform-audit')
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })).newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => problems.push(e.message.slice(0, 300)))
page.setDefaultTimeout(180000)
// Tres ángulos: el objeto tiene que funcionar tridimensionalmente, no sólo
// desde una cámara favorecedora.
for (const [view, name] of [['34', 'platform-master-v2'], ['front', 'platform-master-front'], ['side', 'platform-master-side']]) {
  await page.goto(`${BASE}/master?view=${view}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas')
  await page.waitForFunction('window.__masterReady === true', null, { timeout: 120000 })
  await page.waitForTimeout(3200)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log(`→ ${name}.png`)
}
await browser.close()
console.log(problems.length ? 'incidencias:\n' + [...new Set(problems)].join('\n') : 'sin errores de consola')
