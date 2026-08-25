import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/**
 * QA del tramo interior del capítulo Inicio.
 *
 * Recorre con scroll REAL desde la llegada al interior hasta la salida de
 * Inclusión, que es donde viven los cuatro conceptos. Tres modos:
 *
 *   final        · lo que ve el usuario
 *   composition  · sin copy, para juzgar la composición del interior
 *   copy         · entorno al 50 %, para juzgar tamaño y contraste del texto
 *
 *   node scripts/hero-inner.mjs [final|composition|copy]
 */
const MODE = process.argv[2] ?? 'final'
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const FROM = 0.38
const TO = 0.755
const FRAMES = Number(process.env.HERO_FRAMES ?? 130)
const OUT_DIR = path.join(process.cwd(), 'tmp', 'hero-shots')
const FRAME_DIR = path.join(process.cwd(), 'tmp', `inner-frames-${MODE}`)
const NAME = { final: 'hero-inner-final', composition: 'hero-inner-composition', copy: 'hero-inner-copy' }[MODE]
if (!NAME) throw new Error(`modo desconocido: ${MODE}`)

fs.rmSync(FRAME_DIR, { recursive: true, force: true })
fs.mkdirSync(FRAME_DIR, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.setDefaultTimeout(240000); page.setDefaultNavigationTimeout(240000)
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForTimeout(5200)

if (MODE === 'composition') {
  await page.addStyleTag({ content: '.concept-tag { opacity: 0 !important; }' })
} else if (MODE === 'copy') {
  // Sólo QA: el 3D sigue vivo pero baja para poder juzgar el texto.
  await page.addStyleTag({ content: '.hero-canvas { filter: brightness(.5) saturate(.85); }' })
}

const prog = () => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--hero-progress')) || 0)
const wheel = (dy) => page.evaluate((d) => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, bubbles: true })) }, dy)

/*
  Aproximación proporcional.

  Disparar ruedas mientras Lenis todavía persigue el objetivo sobrepasa el
  destino: el progreso visible va por detrás del acumulado. Se avanza la mitad
  de lo que falta y se deja asentar, de modo que converge sin pasarse.
*/
const chapterPx = await page.evaluate(() => window.innerHeight * 7.7)
const reach = async (target) => {
  for (let guard = 0; guard < 220; guard += 1) {
    const p = await prog()
    if (p >= target) return p
    const remaining = (target - p) * chapterPx
    await wheel(Math.max(12, Math.min(remaining * 0.5, 280)))
    await page.waitForTimeout(55)
  }
  return prog()
}
await reach(FROM)
await page.waitForTimeout(700)

const step = (TO - FROM) / FRAMES
let shot = 0
while (shot < FRAMES) {
  await reach(FROM + step * shot)
  await page.waitForTimeout(70)
  await page.screenshot({ path: path.join(FRAME_DIR, `f${String(shot).padStart(4, '0')}.jpg`), quality: 92, type: 'jpeg' })
  shot += 1
  if (shot % 30 === 0) process.stdout.write(`  ${shot}/${FRAMES} (p=${(await prog()).toFixed(3)})\n`)
}
await browser.close()

const out = path.join(OUT_DIR, `${NAME}.webm`)
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '24', '-i', path.join(FRAME_DIR, 'f%04d.jpg'),
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '31', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' })
console.log(`${NAME}.webm listo · ${FRAMES} fotogramas · ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`)
