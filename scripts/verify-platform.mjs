import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { PLATFORM_CAMERA_KEYFRAMES, createPlatformCameraRail } from '../lib/platform/camera-rail.ts'
import { PLATFORM_MODULES } from '../lib/platform/assembly.ts'
import { assemblyWeight, smootherstep } from '../lib/platform/timeline.ts'
import { sample } from './platform-rail-report.mjs'

const rail = createPlatformCameraRail()
const center = new THREE.Vector3(0, 0, -9)
const point = new THREE.Vector3()
const previous = new THREE.Vector3()
const panelCenter = new THREE.Vector3()
const targetPoint = new THREE.Vector3()
const forward = new THREE.Vector3()
const toActor = new THREE.Vector3()
const localPoint = new THREE.Vector3()
const panelRotation = new THREE.Euler()
const inverseRotation = new THREE.Quaternion()
let maxStep = 0
let minClearance = Infinity
let minimumAt = 0
let nearestActor = '—'
let maxOccupancy = 0
let maximumOccupancyAt = 0
let occupyingActor = '—'

rail.sample(0, previous, targetPoint)
for (let index = 0; index <= 4000; index++) {
  const progress = index / 4000
  rail.sample(progress, point, targetPoint)
  forward.copy(targetPoint).sub(point).normalize()
  if (index) maxStep = Math.max(maxStep, point.distanceTo(previous))
  previous.copy(point)

  /*
    Una sola métrica de seguridad, la de `platform-rail-report.mjs`.

    Aquí había una segunda implementación que medía la ocupación con la esfera
    envolvente de cada panel. Para una losa de 3,35 × 0,38 esa esfera mide lo
    mismo en las tres direcciones, así que un panel visto de canto puntuaba como
    visto de plano: el informe y la puerta daban números distintos para el mismo
    fotograma —55 % frente a 77 %— y ninguna de las dos era discutible por sí
    sola. Dos verdades midiendo lo mismo es exactamente lo que no puede haber en
    una puerta de calidad.
  */
  const reading = sample(progress)
  if (reading.clearance < minClearance) {
    minClearance = reading.clearance
    minimumAt = progress
    nearestActor = reading.nearestActor
  }
  if (reading.worstOccupancy > maxOccupancy) {
    maxOccupancy = reading.worstOccupancy
    maximumOccupancyAt = progress
    occupyingActor = reading.occupyingActor
  }
}

let reverseError = 0
for (let index = 0; index <= 500; index++) {
  const progress = index / 500
  const forwardPoint = new THREE.Vector3()
  const reversePoint = new THREE.Vector3()
  const forwardLook = new THREE.Vector3()
  const reverseLook = new THREE.Vector3()
  rail.sample(progress, forwardPoint, forwardLook)
  rail.sample(1 - (1 - progress), reversePoint, reverseLook)
  reverseError = Math.max(reverseError, forwardPoint.distanceTo(reversePoint), forwardLook.distanceTo(reverseLook))
}

const modelDir = path.join(process.cwd(), 'public', 'detection-home', 'platform', 'models')
const models = ['mechanical-base.glb', 'modular-cube.glb', 'energy-core.glb', 'data-tunnel.glb']
const assets = models.map((file) => ({ file, bytes: fs.statSync(path.join(modelDir, file)).size }))
const maxRoll = Math.max(...PLATFORM_CAMERA_KEYFRAMES.map((frame) => Math.abs(frame.roll))) * 180 / Math.PI
const extents = new THREE.Box3().setFromPoints(PLATFORM_CAMERA_KEYFRAMES.map((frame) => new THREE.Vector3(...frame.position))).getSize(new THREE.Vector3())
const heroSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'hero', 'director.ts'), 'utf8')
const first = PLATFORM_CAMERA_KEYFRAMES[0]
const handoffMatches = heroSource.includes(`cameraPosition: [${first.position.join(', ')}]`) && heroSource.includes(`cameraLookAt: [${first.target.join(', ')}]`)

const result = {
  handoffMatches,
  maxStep,
  safety: { minClearance, minimumAt, nearestActor, maxOccupancy, maximumOccupancyAt, occupyingActor },
  reverseError,
  maxRoll,
  travelExtents: extents.toArray(),
  assets,
}
console.log(JSON.stringify(result, null, 2))
if (!handoffMatches || reverseError > 1e-9 || maxRoll > 4 || minClearance < 0.45 || maxOccupancy > 0.6 || extents.x < 8 || extents.y < 4 || extents.z < 10 || assets.some((asset) => asset.bytes > 2_000_000)) process.exitCode = 1
