import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const base = process.env.HERO_BASE ?? 'http://localhost:3000'
const root = path.join(process.cwd(), 'tmp')
const frames = path.join(root, 'handoff-frames')
const video = path.join(root, 'hero-institution-platform-handoff.webm')
const contact = path.join(root, 'hero-institution-platform-contact-sheet.png')
const start = 0.84
const end = 1.74
const frameCount = 144
const contactMoments = [0.88, 0.94, 0.99, 1.03, 1.08, 1.14, 1.2, 1.32, 1.5, 1.68]

fs.mkdirSync(frames, { recursive: true })
for (const file of fs.readdirSync(frames)) {
  if (file.endsWith('.png')) fs.unlinkSync(path.join(frames, file))
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const problems = []
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()) })
page.on('pageerror', (error) => problems.push(error.message))
page.setDefaultTimeout(180000)
await page.goto(`${base}/?handoffTest=1&p=${start}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true && typeof window.__handoffSetProgress === "function"')
await page.evaluate(() => {
  const boot = document.querySelector('.hero-boot')
  if (boot instanceof HTMLElement) boot.style.display = 'none'
})

for (let index = 0; index < frameCount; index += 1) {
  const progress = start + (end - start) * (index / (frameCount - 1))
  await page.evaluate((value) => window.__handoffSetProgress(value), progress)
  await page.waitForTimeout(34)
  await page.screenshot({
    path: path.join(frames, `frame-${String(index).padStart(4, '0')}.png`),
    animations: 'disabled',
  })
}

for (let index = 0; index < contactMoments.length; index += 1) {
  await page.evaluate((value) => window.__handoffSetProgress(value), contactMoments[index])
  await page.waitForTimeout(80)
  await page.screenshot({
    path: path.join(frames, `contact-${String(index).padStart(2, '0')}.png`),
    animations: 'disabled',
  })
}

await browser.close()

const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
const encode = spawnSync(ffmpeg, [
  '-y', '-framerate', '24', '-i', path.join(frames, 'frame-%04d.png'),
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-pix_fmt', 'yuv420p', video,
], { stdio: 'inherit' })
if (encode.status !== 0) process.exit(encode.status ?? 1)

const sheet = spawnSync(ffmpeg, [
  '-y', '-start_number', '0', '-i', path.join(frames, 'contact-%02d.png'),
  '-vf', 'scale=640:360,tile=2x5', '-frames:v', '1', contact,
], { stdio: 'inherit' })
if (sheet.status !== 0) process.exit(sheet.status ?? 1)

if (problems.length) {
  console.error([...new Set(problems)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`Video: ${video}`)
  console.log(`Contact sheet: ${contact}`)
  console.log('Sin errores de consola ni excepciones.')
}
