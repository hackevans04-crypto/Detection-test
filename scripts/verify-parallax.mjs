import * as THREE from 'three'
import { CAMERA_ORBIT, CAMERA_TARGET, WORLD_Z, frameStage, STAGE_FOV } from '../lib/hero/stage.ts'

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
const FROM = Number(process.argv[2] ?? 0.2)
const TO = Number(process.argv[3] ?? 0.45)

const framing = frameStage(WIDTH, HEIGHT)
const radius = 1.936 // R medido en runtime para brain-organic-digital

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const rangeAt = (v, from, to) => clamp01((v - from) / Math.max(to - from, 1e-4))

/** Réplica exacta del rig de `CameraRig`, incluida la recentrada lateral. */
function cameraAt(p) {
  const orbit = CAMERA_ORBIT.getPoint(p, new THREE.Vector3())
  const offset = CAMERA_TARGET.getPoint(p, new THREE.Vector3())
  const azimuth = THREE.MathUtils.degToRad(orbit.x)
  const elevation = THREE.MathUtils.degToRad(orbit.y)
  const distance = framing.distance * orbit.z
  const flat = Math.cos(elevation) * distance
  const camera = new THREE.PerspectiveCamera(STAGE_FOV, WIDTH / HEIGHT, 0.5, 160)
  camera.position.set(
    framing.stageX + Math.sin(azimuth) * flat,
    framing.lookAtY + Math.sin(elevation) * distance,
    Math.cos(azimuth) * flat,
  )
  const offCentre = framing.lookAtX * (1 - rangeAt(p, 0.18, 0.33))
  camera.lookAt(
    framing.stageX + offCentre + offset.x * radius,
    framing.lookAtY + offset.y * radius,
    offset.z * radius,
  )
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
 * La ley correcta para una cámara que orbita.
 *
 * El enunciado habitual —«cuanto más cerca, más recorrido»— describe una cámara
 * que traslada. Aquí la cámara gira alrededor del cerebro manteniéndolo
 * encuadrado, así que el sujeto es el punto casi inmóvil y el recorrido crece
 * al alejarse de él en cualquiera de los dos sentidos: el fondo barre por
 * detrás y el primer plano cruza por delante, más deprisa todavía.
 */
const pivot = results.find((r) => r.z === WORLD_Z.stage)
const behind = results.filter((r) => r.z < 0).sort((x, y) => y.z - x.z)
const front = results.filter((r) => r.z > 0).sort((x, y) => x.z - y.z)
const problems = []

const monotonic = (list, label) => {
  let previous = pivot.shift
  for (const layer of list) {
    if (layer.shift <= previous) problems.push(`${label}: ${layer.name} (${layer.shift.toFixed(1)} px) no supera a la capa anterior (${previous.toFixed(1)} px)`)
    previous = layer.shift
  }
}
monotonic(behind, 'fondo')
monotonic(front, 'primer plano')

// El fallo que de verdad importa: que dos capas se muevan casi igual.
const spread = max / Math.max(pivot.shift, 0.01)
if (pivot.shift > 40) problems.push(`el escenario se desplaza ${pivot.shift.toFixed(1)} px: la cámara no lo mantiene encuadrado`)
if (spread < 8) problems.push(`recorrido cerca/lejos sólo ${spread.toFixed(1)}:1; las capas se mueven demasiado parecido`)

console.log('')
console.log(`Sujeto encuadrado: ${pivot.shift.toFixed(1)} px`)
console.log(`Barrido máximo:    ${max.toFixed(1)} px (${front.at(-1).name})`)
console.log(`Relación:          ${spread.toFixed(1)}:1`)
console.log('')
if (problems.length) {
  console.log('Ley de parallax INCUMPLIDA:')
  for (const problem of problems) console.log(`  - ${problem}`)
} else {
  console.log('Ley de parallax CUMPLIDA: el sujeto permanece, cada capa recorre lo que le toca por su distancia.')
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
const STEPS = [0.0, 0.35, 0.45]
const cameras = STEPS.map(cameraAt)

console.log('\n--- coordenadas de pantalla por actor ---')
console.log('actor'.padEnd(14) + STEPS.map((s) => `p=${s}`.padStart(16)).join('') + '   Δ 0.35→0.45')
for (const [name, point] of MARKERS) {
  const xy = cameras.map((camera) => project(camera, point))
  const cells = xy.map((v) => `(${Math.round(v.x)},${Math.round(v.y)})`.padStart(16)).join('')
  console.log(name.padEnd(14) + cells + `   ${xy[1].distanceTo(xy[2]).toFixed(0).padStart(6)} px`)
}

const brain = MARKERS[0][1]
const brainXY = cameras.map((camera) => project(camera, brain))

console.log(`\nDeriva del sujeto entre 0.35 y 0.45 (órbita pura): ${brainXY[1].distanceTo(brainXY[2]).toFixed(0)} px`)
console.log(brainXY.map((v, i) => `  p=${STEPS[i]}  x=${Math.round(v.x)} (${(v.x / WIDTH * 100).toFixed(0)} % del ancho)`).join('\n'))
