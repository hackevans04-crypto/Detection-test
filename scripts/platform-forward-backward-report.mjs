import { chromium } from '@playwright/test'
import { conceptFrame, CONCEPTS } from '../lib/platform/timeline.ts'

/*
 * Test de determinismo forward/backward, pedido explícito ("aunque por
 * construcción deba ser determinista, ya aprendimos en este proyecto que
 * medirlo explícitamente encuentra bugs que 'teóricamente' no deberían
 * existir"). Recorre progress 0→1 y 1→0 al mismo paso (0,001) y compara,
 * para cada valor de progreso, el estado REAL renderizado — no una segunda
 * lectura de las mismas funciones puras, que por definición matemática
 * siempre van a coincidir consigo mismas.
 *
 * Novena pasada: la presentación por caras del cubo se eliminó (ver
 * `PLATFORM_BEATS` en `lib/platform/timeline.ts`) — este script medía sus
 * 4 `.platform-face-card` del DOM, que ya no existen. Ahora mide las 4
 * `.platform-concept` (las estaciones interiores, único tramo de lectura
 * que queda) en su lugar.
 *
 * Qué se mide de la escena real (vía navegador, `window.heroThree`):
 *   - cámara: posición, cuaternión, FOV (única fuente: `camera` de Three.js)
 *   - texto de cada estación: `style.opacity` real de las 4
 *     `.platform-concept` del DOM (`platform-chapter.tsx` las escribe cada
 *     frame con `conceptFrame(...).visibility * stationArrival(...)`, sin
 *     ningún estado intermedio)
 *
 * Qué se mide por función pura directamente (documentado, no escondido):
 *   - `conceptFrame` — inspeccionado el código fuente de `platform-chapter.tsx`:
 *     su `visibility` alimenta directamente la opacidad renderizada (multiplicada
 *     por `stationArrival`, que SÍ depende del target real de cámara y por eso
 *     se mide en vivo arriba, no aquí). Se lista aparte para que quede claro
 *     qué se verificó en vivo y qué no.
 *
 * Uso: node scripts/platform-forward-backward-report.mjs
 */
const base = process.env.HERO_BASE ?? 'http://localhost:3000'
const STEP = 0.001

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.setDefaultTimeout(180000)
await page.goto(`${base}/?platformTest=1&heroDebug=1&p=0`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true && typeof window.heroThree !== "undefined"')

async function sweep(direction) {
  return page.evaluate(async (dir) => {
    const state = window.heroThree
    const camera = state.camera
    const conceptCards = Array.from(document.querySelectorAll('.platform-concept'))
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const points = []
    const n = Math.round(1 / 0.001)
    for (let i = 0; i <= n; i += 1) {
      const p = dir === 'forward' ? i / n : (n - i) / n
      window.__heroSetDomProgress(p)
      await nextFrame()
      await nextFrame()
      points.push({
        p: Number(p.toFixed(4)),
        camPos: [camera.position.x, camera.position.y, camera.position.z],
        camQuat: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        fov: camera.fov,
        textOpacity: conceptCards.map((el) => Number(el.style.opacity || 0)),
      })
    }
    return points
  }, direction)
}

console.log('Barrido 0 -> 1 ...')
const forward = await sweep('forward')
console.log('Barrido 1 -> 0 ...')
const backward = await sweep('backward')
await browser.close()

// Mismo grid de progreso en las dos direcciones: se puede indexar 1 a 1
// simplemente invirtiendo uno de los dos arreglos.
backward.reverse()

function quatAngleDeg(a, b) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  dot = Math.min(1, Math.abs(dot))
  return (2 * Math.acos(dot)) * 180 / Math.PI
}
function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const TOL = { camPos: 0.002, camAngle: 0.05, fov: 0.02, textOpacity: 0.01 }
const failures = []
let worstCamPos = 0; let worstCamAngle = 0; let worstFov = 0; let worstText = 0

for (let i = 0; i < forward.length; i += 1) {
  const f = forward[i]; const b = backward[i]
  if (Math.abs(f.p - b.p) > 1e-6) { console.error('Grid desalineado', f.p, b.p); continue }
  const camPosDelta = dist3(f.camPos, b.camPos)
  const camAngleDelta = quatAngleDeg(f.camQuat, b.camQuat)
  const fovDelta = Math.abs(f.fov - b.fov)
  const textDelta = Math.max(...f.textOpacity.map((v, idx) => Math.abs(v - b.textOpacity[idx])))
  worstCamPos = Math.max(worstCamPos, camPosDelta)
  worstCamAngle = Math.max(worstCamAngle, camAngleDelta)
  worstFov = Math.max(worstFov, fovDelta)
  worstText = Math.max(worstText, textDelta)
  if (camPosDelta > TOL.camPos) failures.push({ p: f.p, field: 'camPos', value: camPosDelta })
  if (camAngleDelta > TOL.camAngle) failures.push({ p: f.p, field: 'camAngle', value: camAngleDelta })
  if (fovDelta > TOL.fov) failures.push({ p: f.p, field: 'fov', value: fovDelta })
  if (textDelta > TOL.textOpacity) failures.push({ p: f.p, field: 'textOpacity', value: textDelta })
}

console.log(`\n${forward.length} puntos comparados (paso ${STEP}), medidos en vivo contra la escena real.`)
console.log(`Peor delta cámara (posición): ${worstCamPos.toFixed(5)} u (tolerancia ${TOL.camPos})`)
console.log(`Peor delta cámara (ángulo): ${worstCamAngle.toFixed(5)}° (tolerancia ${TOL.camAngle})`)
console.log(`Peor delta FOV: ${worstFov.toFixed(5)}° (tolerancia ${TOL.fov})`)
console.log(`Peor delta opacidad de texto: ${worstText.toFixed(5)} (tolerancia ${TOL.textOpacity})`)
console.log(`\n${failures.length} fallos de ${forward.length * 4} comparaciones.`)
for (const f of failures.slice(0, 30)) console.log(`  p=${f.p} ${f.field} delta=${f.value.toFixed(5)}`)
if (failures.length > 30) console.log(`  ... y ${failures.length - 30} más.`)

// Campo verificado por función pura (documentado arriba: el componente
// real multiplica su retorno por `stationArrival` antes de pintarlo, así
// que no es exactamente lo renderizado — pero SÍ es la mitad determinista
// de esa cuenta, y se lista aparte a propósito.
console.log('\n--- Verificado por función pura (conceptFrame) ---')
let pureFail = 0
for (let p = 0; p <= 1; p += 0.001) {
  for (const concept of CONCEPTS) {
    const a = conceptFrame(p, concept.window).visibility
    const b = conceptFrame(p, concept.window).visibility
    if (Math.abs(a - b) > 1e-9) pureFail += 1
  }
}
console.log(pureFail === 0
  ? 'conceptFrame es una función pura de progress: 0 diferencias posibles por construcción.'
  : `${pureFail} diferencias encontradas (esto no debería pasar nunca — revisar función).`)
