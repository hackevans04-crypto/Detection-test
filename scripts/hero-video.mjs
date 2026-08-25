import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/**
 * Render determinista del capítulo completo. Cada imagen espera dos frames de
 * Three.js, por lo que no pierde fases aunque el navegador headless no alcance
 * tiempo real. Después se codifica a 1080p, 30 fps y doce segundos exactos.
 *
 *   node scripts/hero-video.mjs [fotogramas fuente]
 *   HERO_DEBUG=1 node scripts/hero-video.mjs [fotogramas fuente]
 */
const BASE = process.env.HERO_BASE ?? 'http://localhost:3000'
const DEBUG_SCENE = process.env.HERO_DEBUG === '1'
const IDLE_SCENE = process.env.HERO_IDLE === '1'
const DURATION_SECONDS = Number(process.env.HERO_DURATION ?? (IDLE_SCENE ? 5 : 12))
const FRAMES = Number(process.argv[2] ?? process.env.HERO_FRAMES ?? (IDLE_SCENE ? 90 : DEBUG_SCENE ? 96 : 180))
const SOURCE_FPS = FRAMES / DURATION_SECONDS
const WIDTH = 1920
const HEIGHT = 1080
const FRAME_EXTENSION = process.env.HERO_FRAME_FORMAT === 'png' ? 'png' : 'jpg'
const FRAME_DIR = path.join(process.cwd(), 'tmp', IDLE_SCENE ? 'video-frames-idle' : DEBUG_SCENE ? 'video-frames-debug' : 'video-frames-final')
const OUT = path.join(
  process.cwd(),
  'tmp',
  'hero-shots',
  IDLE_SCENE ? 'living-brain-idle.webm' : DEBUG_SCENE ? 'immersive-brain-debug.webm' : 'immersive-brain-journey.webm',
)

if (!Number.isFinite(FRAMES) || FRAMES < 12) throw new Error('Se requieren al menos 12 fotogramas fuente.')
fs.rmSync(FRAME_DIR, { recursive: true, force: true })
fs.mkdirSync(FRAME_DIR, { recursive: true })
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const renderer = process.env.HERO_RENDERER ?? (process.platform === 'win32' ? 'd3d11' : 'swiftshader')
const rendererArgs = renderer === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text']
  : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-lcd-text']

const browser = await chromium.launch({ args: rendererArgs })
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
const browserProblems = []
page.on('console', (message) => {
  if (message.type() === 'error') browserProblems.push(`consola: ${message.text()}`)
})
page.on('pageerror', (error) => browserProblems.push(`excepción: ${error.message}`))
page.setDefaultTimeout(240_000)
page.setDefaultNavigationTimeout(240_000)

await page.goto(`${BASE}/?heroTest=1&p=0${DEBUG_SCENE ? '&heroDebugScene=1' : ''}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true')
await page.evaluate(() => document.fonts.ready)

const started = Date.now()
console.log(`Renderizando ${IDLE_SCENE ? 'cerebro vivo en reposo' : DEBUG_SCENE ? 'prueba técnica' : 'película final'} · ${FRAMES} frames fuente · ${WIDTH}x${HEIGHT}`)
for (let index = 0; index < FRAMES; index += 1) {
  const time = index / Math.max(FRAMES - 1, 1)
  const seconds = time * DURATION_SECONDS
  // El recorrido central sigue siendo uniforme. Sólo hay claqueta al inicio y
  // un segundo de hold final para que la entrega espacial al portal se lea.
  const startHold = 0.35
  const endHold = 1
  const progress = IDLE_SCENE
    ? 0
    : seconds <= startHold
      ? 0
      : seconds >= DURATION_SECONDS - endHold
        ? 1
        : (seconds - startHold) / (DURATION_SECONDS - startHold - endHold)
  await page.evaluate((value) => window.__heroSetProgress(value), progress)
  await page.evaluate((value) => window.__heroSetTime(value), time * DURATION_SECONDS)
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
  await page.screenshot({
    path: path.join(FRAME_DIR, `f${String(index).padStart(4, '0')}.${FRAME_EXTENSION}`),
    timeout: 240_000,
    animations: 'disabled',
    caret: 'hide',
    ...(FRAME_EXTENSION === 'jpg' ? { type: 'jpeg', quality: 94 } : {}),
  })
  if (index % 12 === 0 || index === FRAMES - 1) {
    const elapsed = (Date.now() - started) / 1000
    console.log(`  ${String(index + 1).padStart(3)}/${FRAMES} · p=${progress.toFixed(3)} · ${elapsed.toFixed(0)} s`)
  }
}
await browser.close()

if (browserProblems.length) throw new Error([...new Set(browserProblems)].join('\n'))

execFileSync('ffmpeg', [
  '-y', '-framerate', String(SOURCE_FPS), '-i', path.join(FRAME_DIR, `f%04d.${FRAME_EXTENSION}`),
  '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:flags=lanczos`,
  '-fps_mode', 'cfr', '-r', '30',
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '29', '-deadline', 'good', '-cpu-used', '4',
  '-pix_fmt', 'yuv420p', '-an', OUT,
], { stdio: ['ignore', 'ignore', 'pipe'] })

const finalProbe = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames:format=duration,size',
  '-of', 'json', OUT,
], { encoding: 'utf8' }))
const stream = finalProbe.streams?.[0] ?? {}
const mb = Number(finalProbe.format?.size ?? 0) / 1024 / 1024
console.log(`✓ ${path.relative(process.cwd(), OUT)}`)
console.log(`  ${stream.width}x${stream.height} · ${stream.avg_frame_rate} fps · ${Number(finalProbe.format?.duration).toFixed(2)} s · ${mb.toFixed(2)} MB`)
