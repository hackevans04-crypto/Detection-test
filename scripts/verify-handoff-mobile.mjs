import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const out = path.join(process.cwd(), 'tmp', 'mobile-handoff')
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', (error) => errors.push(error.message))
await page.goto('http://localhost:3000/?handoffTest=1&p=1.2', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__heroReady === true && typeof window.__handoffSetProgress === "function"')
await page.evaluate(() => {
  const boot = document.querySelector('.hero-boot')
  if (boot instanceof HTMLElement) boot.style.display = 'none'
})

for (const progress of [1.2, 1.32, 1.67, 1.32, 1.2]) {
  await page.evaluate((value) => window.__handoffSetProgress(value), progress)
  await page.waitForTimeout(160)
  if (progress === 1.2 || progress === 1.32 || progress === 1.67) {
    await page.screenshot({
      path: path.join(out, `mobile-${Math.round(progress * 100)}.png`),
      animations: 'disabled',
    })
  }
}

const metrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  // El chrome del capítulo ya no tiene marca propia —lo dice el raíl global—,
  // así que se comprueba el peso que lo gobierna, que es lo que se quería saber.
  platformChrome: getComputedStyle(document.querySelector('.platform-overlay')).getPropertyValue('--platform-chrome').trim(),
}))
await browser.close()
console.log(JSON.stringify({ metrics, errors: [...new Set(errors)] }, null, 2))
if (metrics.scrollWidth > metrics.innerWidth || errors.length) process.exitCode = 1
