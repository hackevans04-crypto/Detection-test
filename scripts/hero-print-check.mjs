import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const out = path.join(process.cwd(), 'tmp', 'print-check')
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-lcd-text'],
})
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push('consola: ' + m.text()) })
page.on('pageerror', (e) => problems.push('excepcion: ' + e.message))
page.setDefaultTimeout(180000)

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
// El velo de arranque decide cuándo empieza la impresión de la portada, y no
// llega a la misma hora en dos cargas: se espera al aviso y se cuenta desde él.
await page.waitForFunction('window.__heroCurtain === true', null, { timeout: 60000 })
let previous = 0
for (const at of [200, 450, 700, 1000, 1500, 2600]) {
  await page.waitForTimeout(at - previous)
  previous = at
  await page.locator('.hero-copy').screenshot({ path: path.join(out, `copy-${String(at).padStart(4, '0')}.png`), caret: 'hide' })
  console.log('copy-' + at)
}

const hosts = await page.evaluate(() => Array.from(document.querySelectorAll('.print-host'))
  .map((n) => `${n.tagName}.${n.className.split(' ').slice(-2, -1)} print=${n.dataset.print ?? '-'} reveal=${n.style.getPropertyValue('--print-reveal') || '-'}`))
console.log(hosts.join('\n'))

await context.close()
await browser.close()
if (problems.length) { console.log('\n' + [...new Set(problems)].join('\n')); process.exitCode = 1 }
else console.log('\nSin errores de consola.')
