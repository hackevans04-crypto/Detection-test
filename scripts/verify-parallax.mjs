import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

// Node puede ejecutar TypeScript sin transformarlo, pero su resolvedor ESM no
// añade `.ts` a los imports internos que Next sí resuelve. Este hook sólo cubre
// esos specifiers relativos y mantiene la prueba sobre el director real.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const THREE = await import('three')
const { WORLD_Z, frameStage, STAGE_FOV } = await import('../lib/hero/stage.ts')
const { createHeroDirectorFrame, createHeroRail, heroEntryTravel, resolveHeroDirector } = await import('../lib/hero/director.ts')

/**
 * Comprueba la ley de parallax sin renderizar nada.
 *
 * Proyecta un punto fijo situado en cada profundidad del mapa Z y mide cuánto
 * se desplaza en pantalla entre dos progresos. Si el orden no se cumple, el
 * movimiento de scroll está produciendo zoom en lugar de profundidad, y da
 * igual lo bonita que sea la captura.
 *
 *   node --experimental-strip-types scripts/verify-parallax.mjs
 */
const WIDTH = 1920
const HEIGHT = 1080
/*
  Ventana por defecto: 0,18 -> 0,28.

  Es el tramo exterior que va de UNLOCK a DISASSEMBLY. La entrada real empieza
  en 0,43; medirla como si fuera una órbita daría un falso fallo porque allí la
  cámara cruza deliberadamente el cerebro.
*/
const FROM = Number(process.argv[2] ?? 0.18)
const TO = Number(process.argv[3] ?? 0.28)

const framing = frameStage(WIDTH, HEIGHT)
/*
  R del cerebro en unidades de mundo.

  Sale de medir el GLB igual que `measureActor`: la esfera envolvente de
  `brain-organic-digital` tiene radio 0,538 en el espacio del modelo y la altura
  del modelo es 0,9774, así que la escala que lo lleva a BRAIN_WORLD_HEIGHT
  (2,2) es 2,2518 y el radio resultante 1,2115. El 1,936 que había aquí era el
  radio de la esquina de la caja, no el de la esfera que three calcula.
*/
const radius = 1.2115

const rail = createHeroRail(framing, radius)

/** Réplica exacta del rig de `CameraRig`, incluida la recentrada lateral. */
function cameraAt(p) {
  const frame = createHeroDirectorFrame()
  resolveHeroDirector(p, rail, radius, frame)
  const camera = new THREE.PerspectiveCamera(STAGE_FOV, WIDTH / HEIGHT, 0.5, 160)
  camera.position.fromArray(frame.cameraPosition)
  camera.lookAt(new THREE.Vector3().fromArray(frame.cameraLookAt))
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

const a = cameraAt(FROM)
const b = cameraAt(TO)
const project = (camera, point) => {
  const v = point.clone().project(camera)
  return new THREE.Vector2((v.x * 0.5 + 0.5) * WIDTH, (0.5 - v.y * 0.5) * HEIGHT)
}

// Un punto por capa, todos a la misma altura y desplazados en X como estarían
// en el encuadre, para que la comparación sea homogénea.
const layers = [
  ['DeepStars', WORLD_Z.deepStars],
  ['MountainsFar', WORLD_Z.mountainsFar],
  ['FogFar', WORLD_Z.fogFar],
  ['MountainsMid', WORLD_Z.mountainsMid],
  ['FogBack', WORLD_Z.fogBack],
  ['MountainsFront', WORLD_Z.mountainsFront],
  ['FogMiddle', WORLD_Z.fogMiddle],
  ['Escenario', WORLD_Z.stage],
  ['FogFront', WORLD_Z.fogFrontLeft],
  ['LensParticles', WORLD_Z.lensParticles],
]

console.log(`Desplazamiento en pantalla entre p=${FROM} y p=${TO} · ${WIDTH}x${HEIGHT}\n`)
const results = layers.map(([name, z]) => {
  const point = new THREE.Vector3(framing.stageX, 0, z)
  return { name, z, shift: project(a, point).distanceTo(project(b, point)) }
})
const max = Math.max(...results.map((r) => r.shift))
for (const r of results) {
  const bar = '#'.repeat(Math.round((r.shift / max) * 46))
  console.log(`${r.name.padEnd(15)} z=${String(r.z).padStart(6)}  ${r.shift.toFixed(1).padStart(7)} px  ${bar}`)
}

/**
 * Diagnóstico de separación entre planos. En esta versión la cámara hace un
 * dolly dirigido y después atraviesa el sujeto, así que no se exige una órbita
 * monótona: un plano puede cruzar su punto de fuga y recorrer menos píxeles que
 * su vecino aunque exista profundidad real.
 */
const pivot = results.find((r) => r.z === WORLD_Z.stage)
const behind = results.filter((r) => r.z < 0).sort((x, y) => y.z - x.z)
const front = results.filter((r) => r.z > 0).sort((x, y) => x.z - y.z)
const problems = []
const diagnostics = []

const monotonic = (list, label) => {
  let previous = pivot.shift
  for (const layer of list) {
    if (layer.shift <= previous) diagnostics.push(`${label}: ${layer.name} cruza el punto de fuga (${layer.shift.toFixed(1)} px frente a ${previous.toFixed(1)} px)`)
    previous = layer.shift
  }
}
monotonic(behind, 'fondo')
monotonic(front, 'primer plano')

// Sólo falla si todas las capas se comportan casi como un plano único.
const spread = max / Math.max(pivot.shift, 0.01)
if (pivot.shift > 40) diagnostics.push(`el encuadre dirigido desplaza el sujeto ${pivot.shift.toFixed(1)} px`)
if (spread < 4) problems.push(`recorrido cerca/lejos sólo ${spread.toFixed(1)}:1; las capas se mueven demasiado parecido`)

// La prueba decisiva de la nueva película: no basta con acercar el FOV. Entre
// ENTRY y ARRIVAL la cámara debe cambiar X/Y/Z y cruzar el plano del cerebro.
const entry = heroEntryTravel(framing, radius)
const deltaR = entry.delta.map((value) => Math.abs(value) / radius)
if (deltaR[0] < 0.08) problems.push(`ENTRY apenas cambia X (${deltaR[0].toFixed(2)}R)`)
if (deltaR[1] < 0.08) problems.push(`ENTRY apenas cambia Y (${deltaR[1].toFixed(2)}R)`)
if (deltaR[2] < 2.5) problems.push(`ENTRY apenas cambia Z (${deltaR[2].toFixed(2)}R)`)
if (!(entry.from[2] > 0 && entry.to[2] < 0)) problems.push('ENTRY no cruza del exterior al interior del cerebro')

console.log('')
console.log(`Sujeto encuadrado: ${pivot.shift.toFixed(1)} px`)
console.log(`Barrido máximo:    ${max.toFixed(1)} px (${front.at(-1).name})`)
console.log(`Relación:          ${spread.toFixed(1)}:1`)
console.log(`Viaje ENTRY XYZ:   Δ(${entry.delta.map((value) => value.toFixed(2)).join(', ')}) · ${entry.distanceR.toFixed(2)}R`)
console.log('')
if (diagnostics.length) {
  console.log('Notas del encuadre dirigido:')
  for (const diagnostic of diagnostics) console.log(`  - ${diagnostic}`)
  console.log('')
}
if (problems.length) {
  console.log('PRUEBA ESPACIAL INCUMPLIDA:')
  for (const problem of problems) console.log(`  - ${problem}`)
} else {
  console.log('PRUEBA ESPACIAL CUMPLIDA: hay separación de planos y ENTRY cruza el cerebro en X/Y/Z.')
}
process.exitCode = problems.length ? 1 : 0

/* ------------------------------------------------- coordenadas de pantalla */

/**
 * Posición en pantalla de un marcador por actor, en tres progresos.
 *
 * Un único cociente global puede ocultar que dos capas concretas viajan
 * juntas. Registrar la XY de cada marcador y su diferencia es lo que permite
 * afirmar, y no suponer, que cada plano recorre lo suyo.
 */
const MARKERS = [
  ['BrainCenter', new THREE.Vector3(framing.stageX, framing.lookAtY, WORLD_Z.stage)],
  ['MountainsFar', new THREE.Vector3(framing.stageX - 6, 1.5, WORLD_Z.mountainsFar)],
  ['MountainsMid', new THREE.Vector3(framing.stageX - 3, 0.8, WORLD_Z.mountainsMid)],
  ['FogMiddle', new THREE.Vector3(framing.stageX - 1.5, -0.6, WORLD_Z.fogMiddle)],
  ['FogFront', new THREE.Vector3(framing.stageX - 1, -0.4, WORLD_Z.fogFrontLeft)],
  ['LensParticle', new THREE.Vector3(framing.stageX - 0.6, -0.2, WORLD_Z.lensParticles)],
]
const STEPS = [0.0, 0.28, 0.56]
const cameras = STEPS.map(cameraAt)

console.log('\n--- coordenadas de pantalla por actor ---')
console.log('actor'.padEnd(14) + STEPS.map((s) => `p=${s}`.padStart(16)).join('') + '   Δ 0.28→0.56')
for (const [name, point] of MARKERS) {
  const xy = cameras.map((camera) => project(camera, point))
  const cells = xy.map((v) => `(${Math.round(v.x)},${Math.round(v.y)})`.padStart(16)).join('')
  console.log(name.padEnd(14) + cells + `   ${xy[1].distanceTo(xy[2]).toFixed(0).padStart(6)} px`)
}

const brain = MARKERS[0][1]
const brainXY = cameras.map((camera) => project(camera, brain))

console.log(`\nRecorrido del sujeto entre DISASSEMBLY e INNER_FLIGHT: ${brainXY[1].distanceTo(brainXY[2]).toFixed(0)} px`)
console.log(brainXY.map((v, i) => `  p=${STEPS[i]}  x=${Math.round(v.x)} (${(v.x / WIDTH * 100).toFixed(0)} % del ancho)`).join('\n'))
