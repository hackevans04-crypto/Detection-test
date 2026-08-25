import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/**
 * QA del relevo experiencia ↔ cuenta.
 *
 * Graba fotogramas del compositor, no capturas del hilo principal: durante el
 * relevo la escena 3D todavía ocupa ese hilo y un bucle de `screenshot` mediría
 * su propio atasco en vez de lo que ve el usuario.
 *
 *   node scripts/hero-login.mjs
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3100'
const OUT_DIR = path.join(process.cwd(), 'tmp', 'hero-shots')
const FRAME_DIR = path.join(process.cwd(), 'tmp', 'login-frames')
fs.rmSync(FRAME_DIR, { recursive: true, force: true })
fs.mkdirSync(FRAME_DIR, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.setDefaultTimeout(180000); page.setDefaultNavigationTimeout(180000)
const cdp = await page.context().newCDPSession(page)
const frames = []
let recording = false
cdp.on('Page.screencastFrame', async (f) => {
  if (recording) frames.push(f.data)
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch {}
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForTimeout(8000)

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 72, everyNthFrame: 1 })
recording = true
await page.waitForTimeout(700)                                   // el capítulo, quieto
await page.evaluate(() => document.querySelector('.nav-account')?.click())
await page.waitForURL('**/login', { timeout: 15000 })
await page.waitForTimeout(2200)                                  // la cuenta se compone
await page.evaluate(() => document.querySelector('.login-back')?.click())
await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 15000 })
await page.waitForTimeout(2600)                                  // vuelta a la experiencia
recording = false
await cdp.send('Page.stopScreencast')
await browser.close()

frames.forEach((data, i) => fs.writeFileSync(path.join(FRAME_DIR, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64')))
const out = path.join(OUT_DIR, 'hero-login-transition.webm')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '24', '-i', path.join(FRAME_DIR, 'f%04d.jpg'),
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' })
console.log(`hero-login-transition.webm listo · ${frames.length} fotogramas · ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`)
