import * as THREE from 'three'
import { PLATFORM_CAMERA_KEYFRAMES, createPlatformCameraRail, cameraScalar } from '../lib/platform/camera-rail.ts'
import { PLATFORM_MODULES } from '../lib/platform/assembly.ts'
import { assemblyWeight, smootherstep, PLATFORM_BEATS } from '../lib/platform/timeline.ts'

/**
 * Dónde y por culpa de quién se rompe el riel de Plataforma.
 *
 * `verify-platform.mjs` da un veredicto: un mínimo y un máximo. Eso basta para
 * una puerta de CI, pero no para arreglar nada, porque no dice EN QUÉ TRAMO ni
 * QUÉ ACTOR. Esto recorre el riel y saca la peor ocupación y el peor margen de
 * cada beat, que es lo que permite mover un keyframe concreto en lugar de
 * tantear el conjunto.
 *
 * Los límites son los del encargo, no los que traía la puerta: ningún actor
 * puede pasar del 60 % del encuadre y la cámara no puede acercarse a menos de
 * 0,45 u de una superficie sólida.
 */
const OCCUPANCY_LIMIT = 0.6
const CLEARANCE_LIMIT = 0.45

const rail = createPlatformCameraRail()
const core = new THREE.Vector3(0, 0, -9)
const point = new THREE.Vector3()
const targetPoint = new THREE.Vector3()
const forward = new THREE.Vector3()
const panelCenter = new THREE.Vector3()
const toActor = new THREE.Vector3()
const localPoint = new THREE.Vector3()
const panelRotation = new THREE.Euler()
const inverseRotation = new THREE.Quaternion()
const panelQuaternion = new THREE.Quaternion()
const panelHalf = new THREE.Vector3()
// Coincide con `PlatformCast`: el núcleo normalizado mide 0,52 u y la carcasa
// modular completa vive dentro de un grupo escalado a 0,60.
const coreHalf = new THREE.Vector3(0.26, 0.26, 0.26)
const shellScale = 0.6
const identity = new THREE.Quaternion()

/*
  Ocupación medida en pantalla, no con una esfera envolvente.

  La métrica anterior tomaba el radio de la esfera que envuelve al panel. Para
  una losa de 3,35 × 0,38 × 3,35 ese radio es 1,675 en las tres direcciones, así
  que un panel visto de canto —que en pantalla es una línea— puntuaba igual que
  visto de plano. Con eso, el encuadre de presentación del capítulo, donde el
  cubo ENTERO debe verse y ocupa poco más de medio cuadro, salía marcado como
  fallo, y en cambio no distinguía el caso que de verdad molesta.

  Esto proyecta las ocho esquinas de la caja orientada a coordenadas de
  dispositivo y mide el área real que cubre su envolvente, recortada al
  encuadre. Es lo que ve el usuario.
*/
const ASPECT = 16 / 9
const corner = new THREE.Vector3()
const view = new THREE.Matrix4()
const projection = new THREE.Matrix4()
const viewProjection = new THREE.Matrix4()
const up = new THREE.Vector3(0, 1, 0)

function screenOccupancy(center, halfSize, quaternion, eye, look, fov) {
  view.lookAt(eye, look, up)
  view.setPosition(eye)
  view.invert()
  projection.makePerspective(...perspectiveBounds(fov))
  viewProjection.multiplyMatrices(projection, view)

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  let anyInFront = false
  for (let bit = 0; bit < 8; bit++) {
    corner.set(
      (bit & 1 ? halfSize.x : -halfSize.x),
      (bit & 2 ? halfSize.y : -halfSize.y),
      (bit & 4 ? halfSize.z : -halfSize.z),
    ).applyQuaternion(quaternion).add(center)
    // Detrás de la cámara la proyección se invierte y daría un área falsa.
    const depth = corner.clone().applyMatrix4(view).z
    if (depth > -0.05) continue
    anyInFront = true
    corner.applyMatrix4(viewProjection)
    if (corner.x < minX) minX = corner.x
    if (corner.x > maxX) maxX = corner.x
    if (corner.y < minY) minY = corner.y
    if (corner.y > maxY) maxY = corner.y
  }
  if (!anyInFront) return 0
  const width = Math.max(0, Math.min(maxX, 1) - Math.max(minX, -1)) / 2
  const height = Math.max(0, Math.min(maxY, 1) - Math.max(minY, -1)) / 2
  return width * height
}

function perspectiveBounds(fov) {
  const near = 0.1
  const far = 200
  const top = near * Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const height = 2 * top
  const width = ASPECT * height
  return [-width / 2, -width / 2 + width, top, top - height, near, far]
}

export function sample(progress) {
  rail.sample(progress, point, targetPoint)
  forward.copy(targetPoint).sub(point).normalize()
  const fov = cameraScalar(progress, 'fov')
  const assembly = assemblyWeight(progress)

  let worstOccupancy = 0
  let occupyingActor = '—'
  let clearance = Infinity
  let nearestActor = '—'

  const coreDistance = point.distanceTo(core)
  const coreClear = coreDistance - 0.26
  if (coreClear < clearance) { clearance = coreClear; nearestActor = 'núcleo' }
  const coreOccupancy = screenOccupancy(core, coreHalf, identity, point, targetPoint, fov)
  if (coreOccupancy > worstOccupancy) { worstOccupancy = coreOccupancy; occupyingActor = 'núcleo' }

  for (const panel of PLATFORM_MODULES) {
    const stagger = smootherstep(panel.delay, Math.min(1, panel.delay + 0.44), assembly)
    panelCenter.set(
      (panel.assembled[0] + panel.exploded[0] * stagger) * shellScale,
      (panel.assembled[1] + panel.exploded[1] * stagger) * shellScale,
      -9 + ((panel.assembled[2] + 9) + panel.exploded[2] * stagger) * shellScale,
    )
    panelRotation.set(panel.rotation[0] * stagger, panel.rotation[1] * stagger, panel.rotation[2] * stagger)
    inverseRotation.setFromEuler(panelRotation).invert()
    localPoint.copy(point).sub(panelCenter).applyQuaternion(inverseRotation)
    const dx = Math.abs(localPoint.x) - panel.size[0] * shellScale * 0.5
    const dy = Math.abs(localPoint.y) - panel.size[1] * shellScale * 0.5
    const dz = Math.abs(localPoint.z) - panel.size[2] * shellScale * 0.5
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0))
    const gap = outside + Math.min(Math.max(dx, dy, dz), 0)
    if (gap < clearance) { clearance = gap; nearestActor = panel.name }

    panelHalf.set(panel.size[0] * shellScale / 2, panel.size[1] * shellScale / 2, panel.size[2] * shellScale / 2)
    panelQuaternion.setFromEuler(panelRotation)
    const occupancy = screenOccupancy(panelCenter, panelHalf, panelQuaternion, point, targetPoint, fov)
    if (occupancy > worstOccupancy) { worstOccupancy = occupancy; occupyingActor = panel.name }
  }

  return { worstOccupancy, occupyingActor, clearance, nearestActor }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('platform-rail-report.mjs')) {
  const beats = Object.entries(PLATFORM_BEATS)
  console.log('beat'.padEnd(15), 'ocupación'.padStart(11), 'actor'.padEnd(16), 'margen'.padStart(8), 'actor')
  let failures = 0
  for (const [name, [from, to]] of beats) {
    let worst = { worstOccupancy: 0, occupyingActor: '—' }
    let tight = { clearance: Infinity, nearestActor: '—' }
    let worstAt = from
    for (let i = 0; i <= 200; i++) {
      const progress = from + ((to - from) * i) / 200
      const s = sample(progress)
      if (s.worstOccupancy > worst.worstOccupancy) { worst = s; worstAt = progress }
      if (s.clearance < tight.clearance) tight = s
    }
    const badOcc = worst.worstOccupancy > OCCUPANCY_LIMIT
    const badClr = tight.clearance < CLEARANCE_LIMIT
    if (badOcc || badClr) failures++
    console.log(
      name.padEnd(15),
      `${(worst.worstOccupancy * 100).toFixed(1)} %`.padStart(11) + (badOcc ? ' ✗' : '  '),
      worst.occupyingActor.padEnd(16),
      tight.clearance.toFixed(2).padStart(8) + (badClr ? ' ✗' : '  '),
      tight.nearestActor,
      badOcc ? `  (pico en p=${worstAt.toFixed(3)})` : '',
    )
  }
  console.log(`\n${failures} tramos fuera de límite (ocupación ≤ ${OCCUPANCY_LIMIT * 100} %, margen ≥ ${CLEARANCE_LIMIT} u)`)
}
