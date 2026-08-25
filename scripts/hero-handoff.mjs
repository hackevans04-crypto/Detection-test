import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/**
 * QA del relevo Hero → Plataforma.
 *
 * Recorre con scroll REAL desde Institución hasta dentro de la sección
 * Plataforma, se detiene a mitad, continúa, se detiene al otro lado y vuelve
 * entero hacia arriba. Las paradas están para comprobar que la escena queda
 * viva al detenerse y que el retroceso reconstruye el portal en vez de cortar.
 *
 *   node scripts/hero-handoff.mjs
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3100'
const OUT_DIR = path.join(process.cwd(), 'tmp', 'hero-shots')
const FRAME_DIR = path.join(process.cwd(), 'tmp', 'handoff-frames')
fs.rmSync(FRAME_DIR, { recursive: true, force: true })
fs.mkdirSync(FRAME_DIR, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.setDefaultTimeout(240000); page.setDefaultNavigationTimeout(240000)
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForTimeout(6000)

const chapterPx = await page.evaluate(() => window.innerHeight * 7.7)
const scrollY = () => page.evaluate(() => window.scrollY)
const wheel = (d) => page.evaluate((v) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: v, bubbles: true })), d)

let shot = 0
const grab = async () => {
  await page.screenshot({ path: path.join(FRAME_DIR, `f${String(shot).padStart(4,'0')}.jpg`), quality: 90, type: 'jpeg' })
  shot += 1
}
/** Avanza hasta `target` px capturando por el camino, sin sobrepasar. */
const travelTo = async (target, frames) => {
  for (let i = 0; i < frames; i++) {
    for (let g = 0; g < 24; g++) {
      const y = await scrollY()
      const rest = target - y
      if (Math.abs(rest) < 26) break
      await wheel(Math.sign(rest) * Math.max(14, Math.min(Math.abs(rest) * 0.45, 260)))
      await page.waitForTimeout(45)
      if (Math.abs(target - (await scrollY())) < Math.abs(rest) * 0.35) break
    }
    await page.waitForTimeout(60)
    await grab()
  }
}
/** Parada: el scroll se detiene pero el mundo sigue vivo. */
const hold = async (frames) => { for (let i = 0; i < frames; i++) { await page.waitForTimeout(70); await grab() } }

const institution = Math.round(chapterPx * 0.88)
const mid = Math.round(chapterPx * 0.965)
const past = Math.round(chapterPx + 900)

await travelTo(institution, 8)
await travelTo(mid, 26)          // Institución → mitad del relevo
await hold(14)                   // parada a mitad
await travelTo(past, 30)         // continúa hasta dentro de Plataforma
await hold(14)                   // parada al otro lado
await travelTo(institution, 34)  // retroceso completo
await hold(8)
await browser.close()

const out = path.join(OUT_DIR, 'hero-platform-handoff.webm')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '24', '-i', path.join(FRAME_DIR, 'f%04d.jpg'),
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' })
console.log(`hero-platform-handoff.webm listo · ${shot} fotogramas · ${(fs.statSync(out).size/1048576).toFixed(1)} MB`)
