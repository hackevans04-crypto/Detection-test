import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.HERO_BASE ?? 'http://localhost:3000'
const out = path.join(process.cwd(), 'tmp', 'platform-checkpoints')
const points = [0, 0.08, 0.16, 0.3, 0.38, 0.46, 0.56, 0.67, 0.8, 0.92]
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const problems = []
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()) })
page.on('pageerror', (error) => problems.push(error.message))
page.setDefaultTimeout(180000)
await page.goto(`${base}/?platformTest=1&p=0`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true')
await page.evaluate(() => { const boot = document.querySelector('.hero-boot'); if (boot instanceof HTMLElement) boot.style.display = 'none' })

for (const progress of points) {
  await page.evaluate((value) => window.__heroSetDomProgress(value), progress)
  await page.waitForTimeout(280)
  const label = String(Math.round(progress * 100)).padStart(3, '0')
  await page.screenshot({ path: path.join(out, `platform-${label}.png`), animations: 'disabled' })
}

await browser.close()
console.log(problems.length ? [...new Set(problems)].join('\n') : 'Sin errores de consola ni excepciones.')
if (problems.length) process.exitCode = 1
