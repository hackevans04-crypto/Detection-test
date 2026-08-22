import * as THREE from 'three'
import type { ActorKey, Framing } from './stage'

export type Vec3Tuple = [number, number, number]

export type HeroShotName =
  | 'APPROACH'
  | 'AWAKENING'
  | 'UNLOCK'
  | 'DISASSEMBLY'
  | 'ENTRY'
  | 'INNER_FLIGHT'
  | 'INFORMATION'
  | 'REASSEMBLY'
  | 'INSTITUTION'
  | 'PLATFORM_EXIT'
  | 'END'

type CameraUnit = 'distance' | 'radius'

export type HeroShot = {
  name: HeroShotName
  at: number
  /** Exterior shots use the calculated framing distance; close shots use R. */
  cameraUnit: CameraUnit
  cameraPosition: Vec3Tuple
  cameraLookAt: Vec3Tuple
  framingOffset: number
  cameraFov: number
  cameraRoll: number
  brainPosition: Vec3Tuple
  brainRotation: Vec3Tuple
  brainScale: number
  assemblyExplode: number
  entryIntensity: number
  innerIntensity: number
  institutionIntensity: number
  portalIntensity: number
  platformIntensity: number
  hudIntensity: number
  fogIntensity: number
  particleVelocity: number
  keyLightIntensity: number
  rimLightIntensity: number
  accentLightPosition: Vec3Tuple
  actorWeights: Record<ActorKey, number>
  scannerIntensity: number
  neuralIntensity: number
  conceptIntensity: number
}

const actorCue = (values: Partial<Record<ActorKey, number>>): Record<ActorKey, number> => ({
  brain: 1,
  organic: 0,
  interior: 0,
  platform: 1,
  hud: 0,
  neural: 0,
  energy: 0,
  ...values,
})

/**
 * One continuous 3D take. The hybrid brain never swaps to another exterior:
 * it opens, reveals its nested actors, receives the camera and closes again.
 */
export const HERO_SHOTS: readonly HeroShot[] = [
  {
    name: 'APPROACH', at: 0, cameraUnit: 'distance',
    cameraPosition: [0, 0.004, 1.035], cameraLookAt: [0, 0.025, 0], framingOffset: 0,
    cameraFov: 38, cameraRoll: 0,
    brainPosition: [0, 0, 0], brainRotation: [0, 0, 0], brainScale: 1.035,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.45, hudIntensity: 0.08, fogIntensity: 0.82, particleVelocity: 0.34,
    keyLightIntensity: 2.45, rimLightIntensity: 1.8, accentLightPosition: [-2.2, 0.8, 2],
    actorWeights: actorCue({ platform: 0.78, hud: 0.06, energy: 0.2 }),
    scannerIntensity: 0, neuralIntensity: 0, conceptIntensity: 0,
  },
  {
    name: 'AWAKENING', at: 0.08, cameraUnit: 'distance',
    cameraPosition: [-0.025, 0.012, 0.985], cameraLookAt: [0.01, 0.04, 0], framingOffset: 1,
    cameraFov: 37.6, cameraRoll: -0.003,
    brainPosition: [0, 0, 0], brainRotation: [0.008, 0.045, 0], brainScale: 1.045,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.72, hudIntensity: 0.48, fogIntensity: 1.02, particleVelocity: 0.9,
    keyLightIntensity: 3.15, rimLightIntensity: 2.6, accentLightPosition: [-1.7, 1.35, 2.05],
    actorWeights: actorCue({ platform: 0.9, hud: 0.42, energy: 0.44 }),
    scannerIntensity: 1, neuralIntensity: 0.06, conceptIntensity: 0,
  },
  {
    name: 'UNLOCK', at: 0.18, cameraUnit: 'distance',
    cameraPosition: [-0.105, 0.03, 0.91], cameraLookAt: [0.018, 0.045, -0.04], framingOffset: 0.34,
    cameraFov: 37.3, cameraRoll: -0.012,
    brainPosition: [0, 0.012, 0], brainRotation: [0.015, 0.1, -0.005], brainScale: 1.035,
    assemblyExplode: 0.08, entryIntensity: 0.06, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.86, hudIntensity: 1, fogIntensity: 0.9, particleVelocity: 1.45,
    keyLightIntensity: 2.95, rimLightIntensity: 3.35, accentLightPosition: [-0.55, 1.65, 2.3],
    actorWeights: actorCue({ platform: 1, hud: 0.92, interior: 0.2, neural: 0.18, energy: 0.72 }),
    scannerIntensity: 0.5, neuralIntensity: 0.18, conceptIntensity: 0,
  },
  {
    name: 'DISASSEMBLY', at: 0.3, cameraUnit: 'distance',
    cameraPosition: [0.11, 0.022, 0.73], cameraLookAt: [0, 0.03, -0.12], framingOffset: 0,
    cameraFov: 37.8, cameraRoll: 0.021,
    brainPosition: [0, 0.016, 0], brainRotation: [0.012, -0.09, 0.006], brainScale: 1.02,
    assemblyExplode: 0.82, entryIntensity: 0.38, innerIntensity: 0.08, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.92, hudIntensity: 1.08, fogIntensity: 0.7, particleVelocity: 1.9,
    keyLightIntensity: 2.75, rimLightIntensity: 3.85, accentLightPosition: [1.2, 1.2, 2.15],
    actorWeights: actorCue({ platform: 1, hud: 1, interior: 0.76, neural: 0.55, energy: 0.9 }),
    scannerIntensity: 0.14, neuralIntensity: 0.58, conceptIntensity: 0,
  },
  {
    name: 'ENTRY', at: 0.43, cameraUnit: 'radius',
    cameraPosition: [0.19, 0.04, 1.58], cameraLookAt: [0.02, 0, -1.05], framingOffset: 0,
    cameraFov: 38.7, cameraRoll: 0.034,
    brainPosition: [0, 0.02, 0], brainRotation: [0.006, -0.12, 0.01], brainScale: 1.01,
    assemblyExplode: 1, entryIntensity: 1, innerIntensity: 0.48, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.76, hudIntensity: 0.68, fogIntensity: 0.42, particleVelocity: 2.5,
    keyLightIntensity: 2.5, rimLightIntensity: 4.1, accentLightPosition: [1.8, 0.65, 1.2],
    actorWeights: actorCue({ platform: 0.88, hud: 0.64, interior: 1, neural: 0.92, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 1, conceptIntensity: 0.06,
  },
  {
    name: 'INNER_FLIGHT', at: 0.56, cameraUnit: 'radius',
    cameraPosition: [0.06, -0.04, -0.72], cameraLookAt: [-0.12, 0.08, -2.2], framingOffset: 0,
    cameraFov: 39.2, cameraRoll: -0.041,
    brainPosition: [0, 0.02, 0], brainRotation: [0.003, -0.08, 0.006], brainScale: 1,
    assemblyExplode: 1, entryIntensity: 0.86, innerIntensity: 1, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.6, hudIntensity: 0.32, fogIntensity: 0.34, particleVelocity: 2.75,
    keyLightIntensity: 2.25, rimLightIntensity: 3.6, accentLightPosition: [1.25, 0.1, -1.1],
    actorWeights: actorCue({ platform: 0.72, hud: 0.28, interior: 1, neural: 1, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 1, conceptIntensity: 0.34,
  },
  {
    name: 'INFORMATION', at: 0.7, cameraUnit: 'radius',
    cameraPosition: [-0.4, 0.15, -2.42], cameraLookAt: [0.2, -0.04, -3.35], framingOffset: 0,
    cameraFov: 38.5, cameraRoll: 0.028,
    brainPosition: [0, 0.015, 0], brainRotation: [0, -0.03, 0], brainScale: 1,
    assemblyExplode: 0.94, entryIntensity: 0.46, innerIntensity: 1, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.62, hudIntensity: 0.25, fogIntensity: 0.4, particleVelocity: 2.15,
    keyLightIntensity: 2.4, rimLightIntensity: 3.5, accentLightPosition: [-1.4, 0.35, -1.8],
    actorWeights: actorCue({ platform: 0.74, hud: 0.22, interior: 1, neural: 1, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 1, conceptIntensity: 1,
  },
  {
    name: 'REASSEMBLY', at: 0.8, cameraUnit: 'distance',
    cameraPosition: [0.09, 0.025, 0.65], cameraLookAt: [0, 0.015, 0], framingOffset: 0,
    cameraFov: 37.8, cameraRoll: -0.015,
    brainPosition: [0, 0.01, -0.02], brainRotation: [0, 0.04, 0], brainScale: 0.985,
    assemblyExplode: 0.14, entryIntensity: 0.08, innerIntensity: 0.28, institutionIntensity: 0.08, portalIntensity: 0,
    platformIntensity: 0.86, hudIntensity: 0.72, fogIntensity: 0.62, particleVelocity: 1.35,
    keyLightIntensity: 2.8, rimLightIntensity: 3.25, accentLightPosition: [1.6, 0.55, 1.45],
    actorWeights: actorCue({ platform: 1, hud: 0.68, interior: 0.48, neural: 0.42, energy: 0.72 }),
    scannerIntensity: 0.08, neuralIntensity: 0.42, conceptIntensity: 0.3,
  },
  {
    name: 'INSTITUTION', at: 0.88, cameraUnit: 'distance',
    cameraPosition: [0.015, 0.025, 0.98], cameraLookAt: [0, 0.02, 0], framingOffset: 0,
    cameraFov: 38, cameraRoll: 0,
    brainPosition: [0, 0.01, -0.06], brainRotation: [0, 0.015, 0], brainScale: 0.9,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 1, portalIntensity: 0.08,
    platformIntensity: 0.98, hudIntensity: 0.34, fogIntensity: 0.78, particleVelocity: 0.8,
    keyLightIntensity: 2.55, rimLightIntensity: 2.8, accentLightPosition: [0.9, 0.45, -1.45],
    actorWeights: actorCue({ platform: 1, hud: 0.3, interior: 0.08, neural: 0.1, energy: 0.76 }),
    scannerIntensity: 0, neuralIntensity: 0.12, conceptIntensity: 0.06,
  },
  {
    name: 'PLATFORM_EXIT', at: 0.95, cameraUnit: 'radius',
    cameraPosition: [0.08, -0.6, 3.05], cameraLookAt: [0, -1.24, -0.45], framingOffset: 0,
    cameraFov: 38.8, cameraRoll: 0.012,
    brainPosition: [0, 0.18, -0.16], brainRotation: [0, 0.03, 0], brainScale: 0.86,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0.2, portalIntensity: 1,
    platformIntensity: 1.8, hudIntensity: 0.14, fogIntensity: 0.95, particleVelocity: 1.5,
    keyLightIntensity: 2.25, rimLightIntensity: 2.35, accentLightPosition: [0.4, -0.75, 1.2],
    actorWeights: actorCue({ platform: 1, hud: 0.1, interior: 0, neural: 0, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 0, conceptIntensity: 0,
  },
  {
    name: 'END', at: 1, cameraUnit: 'radius',
    cameraPosition: [0, -1.3, -0.72], cameraLookAt: [0, -1.3, -2.8], framingOffset: 0,
    cameraFov: 39.2, cameraRoll: 0,
    brainPosition: [0, 0.36, -0.28], brainRotation: [0, 0.05, 0], brainScale: 0.8,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 1,
    platformIntensity: 2.25, hudIntensity: 0.04, fogIntensity: 0.7, particleVelocity: 1.8,
    keyLightIntensity: 2, rimLightIntensity: 2, accentLightPosition: [0, -1.1, 0.5],
    actorWeights: actorCue({ brain: 0.82, platform: 1, hud: 0.02, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 0, conceptIntensity: 0,
  },
] as const

export type HeroDirectorFrame = {
  shot: HeroShotName
  shotIndex: number
  shotProgress: number
  cameraPosition: Vec3Tuple
  cameraLookAt: Vec3Tuple
  cameraFov: number
  cameraRoll: number
  cameraSpeed: number
  brainPosition: Vec3Tuple
  brainRotation: Vec3Tuple
  brainScale: number
  assemblyExplode: number
  entryIntensity: number
  innerIntensity: number
  institutionIntensity: number
  portalIntensity: number
  platformIntensity: number
  hudIntensity: number
  fogIntensity: number
  particleVelocity: number
  keyLightIntensity: number
  rimLightIntensity: number
  accentLightPosition: Vec3Tuple
  actorWeights: Record<ActorKey, number>
  scannerIntensity: number
  neuralIntensity: number
  conceptIntensity: number
}

export type HeroRail = {
  position: THREE.CatmullRomCurve3
  lookAt: THREE.CatmullRomCurve3
}

const ease = (value: number) => value * value * (3 - 2 * value)
const lerpTuple = (out: Vec3Tuple, a: readonly number[], b: readonly number[], t: number) => {
  out[0] = THREE.MathUtils.lerp(a[0], b[0], t)
  out[1] = THREE.MathUtils.lerp(a[1], b[1], t)
  out[2] = THREE.MathUtils.lerp(a[2], b[2], t)
}

export function createHeroDirectorFrame(): HeroDirectorFrame {
  const shot = HERO_SHOTS[0]
  return {
    shot: shot.name, shotIndex: 0, shotProgress: 0,
    cameraPosition: [0, 0, 0], cameraLookAt: [0, 0, 0],
    cameraFov: shot.cameraFov, cameraRoll: shot.cameraRoll, cameraSpeed: 0,
    brainPosition: [...shot.brainPosition], brainRotation: [...shot.brainRotation], brainScale: shot.brainScale,
    assemblyExplode: shot.assemblyExplode, entryIntensity: shot.entryIntensity, innerIntensity: shot.innerIntensity,
    institutionIntensity: shot.institutionIntensity, portalIntensity: shot.portalIntensity,
    platformIntensity: shot.platformIntensity, hudIntensity: shot.hudIntensity,
    fogIntensity: shot.fogIntensity, particleVelocity: shot.particleVelocity,
    keyLightIntensity: shot.keyLightIntensity, rimLightIntensity: shot.rimLightIntensity,
    accentLightPosition: [...shot.accentLightPosition], actorWeights: { ...shot.actorWeights },
    scannerIntensity: shot.scannerIntensity, neuralIntensity: shot.neuralIntensity,
    conceptIntensity: shot.conceptIntensity,
  }
}

export function createHeroRail(framing: Framing, radius: number): HeroRail {
  const positions = HERO_SHOTS.map((shot) => {
    const unit = shot.cameraUnit === 'distance' ? framing.distance : radius
    return new THREE.Vector3(
      framing.stageX + shot.cameraPosition[0] * unit,
      framing.stageY + shot.cameraPosition[1] * unit + framing.lookAtY * shot.framingOffset,
      shot.cameraPosition[2] * unit,
    )
  })
  const lookAt = HERO_SHOTS.map((shot) => new THREE.Vector3(
    framing.stageX + shot.cameraLookAt[0] * radius + framing.lookAtX * shot.framingOffset,
    framing.stageY + shot.cameraLookAt[1] * radius + framing.lookAtY * shot.framingOffset,
    shot.cameraLookAt[2] * radius,
  ))
  return {
    position: new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.42),
    lookAt: new THREE.CatmullRomCurve3(lookAt, false, 'catmullrom', 0.42),
  }
}

function locateShot(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1)
  let index = 0
  while (index < HERO_SHOTS.length - 2 && p >= HERO_SHOTS[index + 1].at) index += 1
  const current = HERO_SHOTS[index]
  const next = HERO_SHOTS[Math.min(index + 1, HERO_SHOTS.length - 1)]
  const raw = current === next ? 1 : THREE.MathUtils.clamp((p - current.at) / Math.max(next.at - current.at, 1e-5), 0, 1)
  return { index, current, next, local: ease(raw) }
}

const railPosition = new THREE.Vector3()
const railLookAt = new THREE.Vector3()
const railAhead = new THREE.Vector3()
const railBehind = new THREE.Vector3()
const travelDirection = new THREE.Vector3()

/** Resolve a reversible, deterministic frame from scroll progress alone. */
export function resolveHeroDirector(progress: number, rail: HeroRail, radius: number, out: HeroDirectorFrame) {
  const { index, current, next, local } = locateShot(progress)
  const curveT = (index + local) / (HERO_SHOTS.length - 1)
  rail.position.getPoint(curveT, railPosition)
  rail.lookAt.getPoint(curveT, railLookAt)

  rail.position.getPoint(Math.min(curveT + 0.01, 1), railAhead)
  rail.position.getPoint(Math.max(curveT - 0.004, 0), railBehind)
  travelDirection.copy(railAhead).sub(railPosition)
  railLookAt.addScaledVector(travelDirection, 0.04)

  out.shot = current.name
  out.shotIndex = index
  out.shotProgress = local
  out.cameraPosition[0] = railPosition.x
  out.cameraPosition[1] = railPosition.y
  out.cameraPosition[2] = railPosition.z
  out.cameraLookAt[0] = railLookAt.x
  out.cameraLookAt[1] = railLookAt.y
  out.cameraLookAt[2] = railLookAt.z
  out.cameraSpeed = THREE.MathUtils.clamp(railAhead.distanceTo(railBehind) / Math.max(radius * 0.28, 1e-5), 0, 2.4)
  out.cameraFov = THREE.MathUtils.lerp(current.cameraFov, next.cameraFov, local)
  out.cameraRoll = THREE.MathUtils.lerp(current.cameraRoll, next.cameraRoll, local)
  lerpTuple(out.brainPosition, current.brainPosition, next.brainPosition, local)
  lerpTuple(out.brainRotation, current.brainRotation, next.brainRotation, local)
  lerpTuple(out.accentLightPosition, current.accentLightPosition, next.accentLightPosition, local)
  out.accentLightPosition[0] *= radius
  out.accentLightPosition[1] *= radius
  out.accentLightPosition[2] *= radius

  const scalarKeys = [
    'brainScale', 'assemblyExplode', 'entryIntensity', 'innerIntensity', 'institutionIntensity',
    'portalIntensity', 'platformIntensity', 'hudIntensity', 'fogIntensity', 'particleVelocity',
    'keyLightIntensity', 'rimLightIntensity', 'scannerIntensity', 'neuralIntensity', 'conceptIntensity',
  ] as const
  for (const key of scalarKeys) out[key] = THREE.MathUtils.lerp(current[key], next[key], local)
  for (const key of Object.keys(out.actorWeights) as ActorKey[]) {
    out.actorWeights[key] = THREE.MathUtils.lerp(current.actorWeights[key], next.actorWeights[key], local)
  }
  // Hard continuity rule: the canonical exterior is never swapped out.
  out.actorWeights.brain = Math.max(out.actorWeights.brain, 0.82)
  out.actorWeights.organic = 0
}

export function closestHeroRailDistance(framing: Framing, radius: number, samples = 400) {
  const rail = createHeroRail(framing, radius)
  const frame = createHeroDirectorFrame()
  const camera = new THREE.Vector3()
  const brain = new THREE.Vector3()
  let closest = Infinity
  for (let index = 0; index <= samples; index += 1) {
    resolveHeroDirector(index / samples, rail, radius, frame)
    camera.fromArray(frame.cameraPosition)
    brain.set(
      framing.stageX + frame.brainPosition[0] * radius,
      framing.stageY + frame.brainPosition[1] * radius,
      frame.brainPosition[2] * radius,
    )
    closest = Math.min(closest, camera.distanceTo(brain))
  }
  return closest
}

/** Numeric proof that ENTRY changes X, Y and Z instead of being a flat zoom. */
export function heroEntryTravel(framing: Framing, radius: number) {
  const rail = createHeroRail(framing, radius)
  const from = createHeroDirectorFrame()
  const to = createHeroDirectorFrame()
  resolveHeroDirector(0.43, rail, radius, from)
  resolveHeroDirector(0.7, rail, radius, to)
  const delta: Vec3Tuple = [
    to.cameraPosition[0] - from.cameraPosition[0],
    to.cameraPosition[1] - from.cameraPosition[1],
    to.cameraPosition[2] - from.cameraPosition[2],
  ]
  return {
    from: [...from.cameraPosition] as Vec3Tuple,
    to: [...to.cameraPosition] as Vec3Tuple,
    delta,
    distanceR: new THREE.Vector3(...delta).length() / radius,
  }
}
