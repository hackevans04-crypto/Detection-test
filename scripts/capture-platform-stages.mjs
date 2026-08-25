import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const base = process.env.HERO_BASE ?? 'http://localhost:3000'
const root = path.join(process.cwd(), 'tmp', 'platform-stages')
fs.mkdirSync(root, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const problems = []
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()) })
page.on('pageerror', (error) => problems.push(error.message))
page.setDefaultTimeout(180000)
await page.goto(`${base}/?platformTest=1&p=0`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true && typeof window.__heroSetDomProgress === "function"')
await page.evaluate(() => {
  const boot = document.querySelector('.hero-boot')
  if (boot instanceof HTMLElement) boot.style.display = 'none'
})

const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
async function capture(name, { copy = true, frameCount = 156 } = {}) {
  const frames = path.join(root, `${name}-frames`)
  fs.mkdirSync(frames, { recursive: true })
  for (const file of fs.readdirSync(frames)) if (file.endsWith('.png')) fs.unlinkSync(path.join(frames, file))
  await page.evaluate((showCopy) => {
    let style = document.querySelector('#qa-object-only')
    if (!showCopy && !(style instanceof HTMLStyleElement)) {
      style = document.createElement('style')
      style.id = 'qa-object-only'
      style.textContent = '.platform-overlay, header, .hero-header { display:none!important }'
      document.head.append(style)
    } else if (showCopy && style) style.remove()
  }, copy)
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / (frameCount - 1)
    await page.evaluate((value) => window.__heroSetDomProgress(value), progress)
    await page.waitForTimeout(32)
    await page.screenshot({ path: path.join(frames, `frame-${String(index).padStart(4, '0')}.png`), animations: 'disabled' })
  }
  const output = path.join(root, `${name}.webm`)
  const encoded = spawnSync(ffmpeg, [
    '-y', '-framerate', '24', '-i', path.join(frames, 'frame-%04d.png'),
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
    '-b:v', '0', '-crf', '30', '-row-mt', '1', '-pix_fmt', 'yuv420p', output,
  ], { stdio: 'inherit' })
  if (encoded.status !== 0) process.exit(encoded.status ?? 1)
  console.log(output)
}

await capture('02-platform-object-only', { copy: false })
await capture('03-platform-concepts', { copy: true })
await browser.close()

if (problems.length) {
  console.error([...new Set(problems)].join('\n'))
  process.exitCode = 1
} else console.log('Sin errores de consola ni excepciones.')
