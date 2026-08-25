import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/**
 * Vídeo de continuidad del capítulo.
 *
 * No es una grabación en tiempo real: el renderizador por software de este
 * entorno da un fotograma por segundo, así que capturar la pantalla mientras se
 * hace scroll produciría un tirón sin valor diagnóstico. En su lugar se
 * renderiza una rejilla densa de progresos deterministas y se codifica en
 * orden. El resultado recorre exactamente la misma línea de tiempo que el
 * scroll y sirve para lo único que se le pide: ver si los capítulos se
 * distinguen y si algo salta entre uno y otro.
 *
 *   node scripts/hero-video.mjs [fotogramas]
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const FRAMES = Number(process.argv[2] ?? 96)
const FPS = 12
const WIDTH = 1280
const HEIGHT = 720
const DIR = path.join(process.cwd(), 'tmp', 'video-frames')
const OUT = path.join(process.cwd(), 'tmp', 'hero-shots', 'hero-scroll-validation.webm')

fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
page.setDefaultTimeout(240_000)
await page.goto(`${BASE}/?heroTest=1&p=0`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true')

const started = Date.now()
for (let i = 0; i < FRAMES; i++) {
  const p = i / (FRAMES - 1)
  await page.evaluate((v) => window.__heroSetProgress(v), p)
  // Basta un margen corto: el amortiguado converge y el reloj está congelado,
  // así que cada fotograma es el estado estable de su progreso.
  await page.waitForTimeout(420)
  await page.screenshot({
    path: path.join(DIR, `f${String(i).padStart(4, '0')}.png`),
    timeout: 240_000,
    animations: 'disabled',
  })
  if (i % 12 === 0) {
    const elapsed = (Date.now() - started) / 1000
    console.log(`  ${i}/${FRAMES}  p=${p.toFixed(3)}  ${elapsed.toFixed(0)} s`)
  }
}
await browser.close()

fs.mkdirSync(path.dirname(OUT), { recursive: true })
execFileSync('ffmpeg', [
  '-y', '-framerate', String(FPS), '-i', path.join(DIR, 'f%04d.png'),
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p',
  OUT,
], { stdio: ['ignore', 'ignore', 'pipe'] })

const mb = fs.statSync(OUT).size / 1024 / 1024
console.log(`\n✓ ${path.relative(process.cwd(), OUT)}  ${FRAMES} fotogramas · ${(FRAMES / FPS).toFixed(1)} s · ${mb.toFixed(2)} MB`)
