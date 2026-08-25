import * as THREE from 'three'
import type { ActorKey, Framing } from './stage'
import { at, conceptWindow, getNeuralPhaseIntensity, readingHold, until } from './timeline'

export type Vec3Tuple = [number, number, number]

export type HeroShotName =
  | 'APPROACH'
  | 'AWAKENING'
  | 'UNLOCK'
  | 'DISASSEMBLY'
  | 'ENTRY'
  | 'INNER_FLIGHT'
  | 'INFORMATION'
  | 'INNER_EXIT'
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

/*
  Pesos de actor del viaje interior: RESTAURADOS desde `bb70767`.

  Estaban a cero —interior, neural, energy y hud— en ENTRY, INNER_FLIGHT,
  INFORMATION y REASSEMBLY, que son exactamente los planos en los que la cámara
  está DENTRO del cerebro. El resultado era el que se ve en el vídeo: se cruza
  la abertura y el interior está vacío, porque el reactor (`energy-reactor`), el
  clúster neuronal (`neural-cluster`) y la jaula orbital (`hud-orbital`) se
  apagaban justo al entrar.

  Se restauran los valores por NOMBRE DE PLANO, no el bloque entero: el reparto
  temporal y la curva de cámara son los nuevos y no se tocan. `INNER_EXIT` es el
  único plano sin equivalente en el commit aprobado —no existía—, así que toma
  el punto medio entre INFORMATION y REASSEMBLY; queda marcado como interpolado.
*/
/*
  `assemblyExplode` en DISASSEMBLY: RESTAURADO de 0,14 a 0,82 (valor de `bb70767`).

  Es la causa de que el interior del cerebro se sintiera vacío al scrolear, y no
  era que faltaran actores: `hero-stage` dibuja todo lo interior con
  `opacidad × (0,12 + assemblyExplode × 0,88)`. Con 0,14 ese factor valía 0,24, o
  sea que el reactor, el clúster neuronal y la jaula orbital se pintaban al 24 %
  de su opacidad durante TODA la apertura —estaban ahí, pero traslúcidos sobre un
  fondo azul, que es justo la definición de «no se ve»—. Con 0,82 el factor
  vuelve a 0,84 y el interior se lee mientras el cerebro se abre, que es cuando
  el usuario está mirando dentro.

  `entryIntensity` e `innerIntensity` de esos dos planos se restauran con él:
  van juntos en la misma clave y son los que alimentan la emisión.
*/
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
 *
 * La componente X describe UN SOLO ARCO. La versión anterior tenía seis
 * inversiones de dirección —medidas, no percibidas— y recorría 5,69 unidades de
 * mundo en lateral para acabar exactamente en el punto de partida: eficiencia
 * 0 %. Eso es lo que se leía como «izquierda, derecha, centro» sin motivo.
 *
 * Ahora la cámara no cruza nunca el eje: se queda todo el capítulo del mismo
 * lado, que es lo que mata la lectura de «izquierda, derecha». La amplitud sí
 * se estrecha al entrar —dentro del sujeto la distancia radial es menor que su
 * propio radio, y una X grande ahí mete la cámara en la masa y deja dos paredes
 * azules sin silueta—. Cualquier retoque debe volver a pasar por
 * tmp/real-rail-audit.mjs Y por la hoja de contacto: el audito numérico no ve
 * que el encuadre se haya roto.
 */
export const HERO_SHOTS: readonly HeroShot[] = [
  {
    name: 'APPROACH', at: at('INTRO'), cameraUnit: 'distance',
    cameraPosition: [0, 0.004, 1.035], cameraLookAt: [0, 0.025, 0], framingOffset: 0,
    cameraFov: 38, cameraRoll: 0,
    brainPosition: [0, 0, 0], brainRotation: [0, 0, 0], brainScale: 1.035,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.45, hudIntensity: 0.08, fogIntensity: 0.82, particleVelocity: 0.34,
    keyLightIntensity: 2.45, rimLightIntensity: 1.8, accentLightPosition: [-2.2, 0.8, 2],
    actorWeights: actorCue({ platform: 0.78, hud: 0, energy: 0 }),
    scannerIntensity: 0, neuralIntensity: 0, conceptIntensity: 0,
  },
  {
    name: 'AWAKENING', at: at('ACTIVATION'), cameraUnit: 'distance',
    cameraPosition: [-0.041, 0.012, 0.985], cameraLookAt: [0.01, 0.04, 0], framingOffset: 1,
    cameraFov: 37.6, cameraRoll: -0.003,
    brainPosition: [0, 0, 0], brainRotation: [0.008, 0.045, 0], brainScale: 1.045,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.72, hudIntensity: 0.48, fogIntensity: 1.02, particleVelocity: 0.9,
    keyLightIntensity: 3.15, rimLightIntensity: 2.6, accentLightPosition: [-1.7, 1.35, 2.05],
    actorWeights: actorCue({ platform: 0.9, hud: 0.42, energy: 0 }),
    scannerIntensity: 1, neuralIntensity: 0.06, conceptIntensity: 0,
  },
  {
    name: 'UNLOCK', at: at('UNLOCK'), cameraUnit: 'distance',
    cameraPosition: [-0.110, 0.03, 0.91], cameraLookAt: [0.018, 0.045, -0.04], framingOffset: 0.34,
    cameraFov: 37.3, cameraRoll: -0.012,
    brainPosition: [0, 0.012, 0], brainRotation: [0.015, 0.1, -0.005], brainScale: 1.035,
    assemblyExplode: 0.08, entryIntensity: 0.06, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.86, hudIntensity: 1, fogIntensity: 0.9, particleVelocity: 1.45,
    keyLightIntensity: 2.95, rimLightIntensity: 3.35, accentLightPosition: [-0.55, 1.65, 2.3],
    actorWeights: actorCue({ platform: 1, hud: 0.92, interior: 0.2, neural: 0.18, energy: 0.72 }),
    scannerIntensity: 0.5, neuralIntensity: 0.18, conceptIntensity: 0,
  },
  {
    name: 'DISASSEMBLY', at: at('DISASSEMBLY'), cameraUnit: 'distance',
    cameraPosition: [-0.130, 0.022, 0.78], cameraLookAt: [0, 0.03, -0.12], framingOffset: 0,
    cameraFov: 37.8, cameraRoll: 0.021,
    brainPosition: [0, 0.016, 0], brainRotation: [0.012, -0.09, 0.006], brainScale: 1.02,
    assemblyExplode: 0.82, entryIntensity: 0.38, innerIntensity: 0.08, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.92, hudIntensity: 1.08, fogIntensity: 0.7, particleVelocity: 1.9,
    keyLightIntensity: 2.75, rimLightIntensity: 3.85, accentLightPosition: [1.2, 1.2, 2.15],
    actorWeights: actorCue({ platform: 1, hud: 1, interior: 0.76, neural: 0.55, energy: 0.9 }),
    scannerIntensity: 0.14, neuralIntensity: 0.58, conceptIntensity: 0,
  },
  {
    name: 'ENTRY', at: at('ENTRY'), cameraUnit: 'radius',
    // Aún fuera del ensamblaje: primero se entiende la apertura completa y
    // el tramo ENTRY posterior cruza la separación. Con 1.58 R la lente ya
    // estaba entre las mallas durante DISASSEMBLY y el despiece se leía como
    // una colisión azul, no como una acción anatómica.
    cameraPosition: [-0.15, 0.04, 3.0], cameraLookAt: [0.02, 0, -0.55], framingOffset: 0,
    cameraFov: 38.7, cameraRoll: 0.034,
    brainPosition: [0, 0.02, 0], brainRotation: [0.006, -0.12, 0.01], brainScale: 1.01,
    assemblyExplode: 1, entryIntensity: 1, innerIntensity: 0.48, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.76, hudIntensity: 0.68, fogIntensity: 0.42, particleVelocity: 2.5,
    keyLightIntensity: 2.5, rimLightIntensity: 4.1, accentLightPosition: [1.8, 0.65, 1.2],
    actorWeights: actorCue({ platform: 0.88, hud: 0.64, interior: 1, neural: 0.92, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 1, conceptIntensity: 0.06,
  },
  {
    name: 'INNER_FLIGHT', at: at('ARRIVAL'), cameraUnit: 'radius',
    cameraPosition: [-0.060, -0.04, -0.72], cameraLookAt: [-0.12, 0.08, -2.2], framingOffset: 0,
    cameraFov: 39.2, cameraRoll: -0.041,
    brainPosition: [0, 0.02, 0], brainRotation: [0.003, -0.08, 0.006], brainScale: 1,
    assemblyExplode: 1, entryIntensity: 0.86, innerIntensity: 1, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.6, hudIntensity: 0.32, fogIntensity: 0.34, particleVelocity: 2.75,
    keyLightIntensity: 2.25, rimLightIntensity: 3.6, accentLightPosition: [1.25, 0.1, -1.1],
    actorWeights: actorCue({ platform: 0.72, hud: 0.28, interior: 1, neural: 1, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 1, conceptIntensity: 0.72,
  },
  {
    name: 'INFORMATION', at: at('EVALUATION'), cameraUnit: 'radius',
    cameraPosition: [-0.400, 0.15, -2.42], cameraLookAt: [0.2, -0.04, -3.35], framingOffset: 0,
    cameraFov: 38.5, cameraRoll: 0.028,
    brainPosition: [0, 0.015, 0], brainRotation: [0, -0.03, 0], brainScale: 1,
    assemblyExplode: 0.94, entryIntensity: 0.46, innerIntensity: 1, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.62, hudIntensity: 0.25, fogIntensity: 0.4, particleVelocity: 2.15,
    keyLightIntensity: 2.4, rimLightIntensity: 3.5, accentLightPosition: [-1.4, 0.35, -1.8],
    actorWeights: actorCue({ platform: 0.74, hud: 0.22, interior: 1, neural: 1, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 1, conceptIntensity: 1,
  },
  {
    /*
      Salida del interior. Existe por sincronía, no por estética: sin él el riel
      interpolaba de INFORMATION al exterior a lo largo de todo el bloque de
      lectura, y los conceptos tercero y cuarto se leían con la cámara ya de
      salida. Sostiene el interior hasta que termina el último texto.
    */
    name: 'INNER_EXIT', at: at('INNER_EXIT'), cameraUnit: 'radius',
    cameraPosition: [-0.474, 0.09, -0.55], cameraLookAt: [0.08, -0.02, -1.75], framingOffset: 0,
    cameraFov: 39, cameraRoll: -0.028,
    brainPosition: [0, 0.02, 0], brainRotation: [0.002, -0.05, 0.004], brainScale: 1,
    assemblyExplode: 0.95, entryIntensity: 0.6, innerIntensity: 0.9, institutionIntensity: 0, portalIntensity: 0,
    platformIntensity: 0.68, hudIntensity: 0.5, fogIntensity: 0.46, particleVelocity: 2.3,
    keyLightIntensity: 2.5, rimLightIntensity: 3.4, accentLightPosition: [-0.9, 0.4, -1.2],
    actorWeights: actorCue({ platform: 0.74, hud: 0.45, interior: 0.74, neural: 0.71, energy: 0.86 }),
    scannerIntensity: 0, neuralIntensity: 0.9, conceptIntensity: 0.3,
  },
  {
    name: 'REASSEMBLY', at: at('REASSEMBLY'), cameraUnit: 'distance',
    cameraPosition: [-0.100, 0.025, 0.65], cameraLookAt: [0, 0.015, 0], framingOffset: 0,
    cameraFov: 37.8, cameraRoll: -0.015,
    brainPosition: [0, 0.01, -0.02], brainRotation: [0, 0.04, 0], brainScale: 0.985,
    assemblyExplode: 0.96, entryIntensity: 0.34, innerIntensity: 0.72, institutionIntensity: 0.08, portalIntensity: 0,
    platformIntensity: 0.86, hudIntensity: 0.88, fogIntensity: 0.62, particleVelocity: 1.35,
    keyLightIntensity: 2.8, rimLightIntensity: 3.25, accentLightPosition: [1.6, 0.55, 1.45],
    actorWeights: actorCue({ platform: 1, hud: 0.68, interior: 0.48, neural: 0.42, energy: 0.72 }),
    scannerIntensity: 0.08, neuralIntensity: 0.82, conceptIntensity: 0.12,
  },
  {
    name: 'INSTITUTION', at: at('INSTITUTION'), cameraUnit: 'distance',
    cameraPosition: [-0.055, 0.025, 0.98], cameraLookAt: [0, 0.02, 0], framingOffset: 0,
    cameraFov: 38, cameraRoll: 0,
    brainPosition: [0, 0.01, -0.06], brainRotation: [0, 0.015, 0], brainScale: 0.9,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 1, portalIntensity: 0.08,
    platformIntensity: 0.98, hudIntensity: 0.34, fogIntensity: 0.78, particleVelocity: 0.8,
    keyLightIntensity: 2.55, rimLightIntensity: 2.8, accentLightPosition: [0.9, 0.45, -1.45],
    actorWeights: actorCue({ platform: 1, hud: 0, interior: 0, neural: 0, energy: 0 }),
    scannerIntensity: 0, neuralIntensity: 0.12, conceptIntensity: 0.06,
  },
  {
    name: 'PLATFORM_EXIT', at: at('PLATFORM'), cameraUnit: 'radius',
    cameraPosition: [-0.089, -0.6, 3.05], cameraLookAt: [0, -1.24, -0.45], framingOffset: 0,
    cameraFov: 38.8, cameraRoll: 0.012,
    brainPosition: [0, 0.18, -0.16], brainRotation: [0, 0.03, 0], brainScale: 0.86,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0.2, portalIntensity: 1,
    platformIntensity: 1.28, hudIntensity: 0.14, fogIntensity: 0.95, particleVelocity: 1.5,
    keyLightIntensity: 2.25, rimLightIntensity: 2.35, accentLightPosition: [0.4, -0.75, 1.2],
    actorWeights: actorCue({ platform: 1, hud: 0.1, interior: 0, neural: 0, energy: 1 }),
    scannerIntensity: 0, neuralIntensity: 0, conceptIntensity: 0,
  },
  {
    name: 'END', at: until('PLATFORM'), cameraUnit: 'radius',
    cameraPosition: [0, -1.05, -1.4], cameraLookAt: [0, -1.18, -3], framingOffset: 0,
    cameraFov: 39.2, cameraRoll: 0,
    brainPosition: [0, 0.36, -0.28], brainRotation: [0, 0.05, 0], brainScale: 0.8,
    assemblyExplode: 0, entryIntensity: 0, innerIntensity: 0, institutionIntensity: 0, portalIntensity: 1,
    platformIntensity: 1.08, hudIntensity: 0.04, fogIntensity: 0.7, particleVelocity: 1.8,
    keyLightIntensity: 2, rimLightIntensity: 2, accentLightPosition: [0, -1.1, 0.5],
    actorWeights: actorCue({ brain: 0.82, platform: 1, hud: 0.02, energy: 0.82 }),
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
  /** Cuánto manda la lectura ahora mismo. Ver `readingHold`. */
  readingHold: number
}

export type HeroRail = {
  position: THREE.CatmullRomCurve3
  lookAt: THREE.CatmullRomCurve3
  /**
   * Longitud de arco acumulada del tramo de lectura, normalizada.
   *
   * La Catmull-Rom no recorre distancia uniforme: dentro del plano de
   * lectura la cámara pasaba de 2,3 a 12,2 unidades de mundo por unidad de
   * progreso, así que un concepto se leía casi parado y otro en marcha.
   * Repartir sobre distancia real iguala los cuatro.
   */
  reading: Float64Array
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
    conceptIntensity: shot.conceptIntensity, readingHold: 0,
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
  const position = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.42)

  // Longitud de arco del tramo de lectura. Una vez por encuadre.
  const readingIndex = HERO_SHOTS.findIndex((shot) => shot.name === 'INFORMATION')
  const segments = HERO_SHOTS.length - 1
  const fromT = readingIndex / segments
  const toT = (readingIndex + 1) / segments
  const steps = 256
  const reading = new Float64Array(steps + 1)
  const cursor = new THREE.Vector3()
  const previous = position.getPoint(fromT, new THREE.Vector3())
  for (let i = 1; i <= steps; i += 1) {
    position.getPoint(fromT + (toT - fromT) * (i / steps), cursor)
    reading[i] = reading[i - 1] + cursor.distanceTo(previous)
    previous.copy(cursor)
  }
  const total = reading[steps] || 1
  for (let i = 0; i <= steps; i += 1) reading[i] /= total

  return {
    position,
    lookAt: new THREE.CatmullRomCurve3(lookAt, false, 'catmullrom', 0.42),
    reading,
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

/*
  Reparametrización del tramo de lectura.

  Dentro del plano INFORMATION el scroll avanza uniformemente, pero la cámara
  no debe: tiene que quedarse casi quieta mientras se lee un concepto y
  recuperar el terreno en el hueco siguiente. Reparte el mismo recorrido de
  curva con velocidad 0,3 durante los holds y 1 fuera de ellos.

  Esto es lo que convierte «la cámara recorre curvas todo el rato» en «llega,
  respira, revela y sigue». No es un multiplicador de velocidad paralelo: es
  la misma curva repartida de otra manera, y sale de las mismas ventanas de
  concepto que usa el texto, así que no pueden desincronizarse.

  La tabla se calcula una vez al cargar; en caliente sólo hay una
  interpolación.
*/
const READING_SPAN = [at('EVALUATION'), at('INNER_EXIT')] as const
const HOLD_SPEED = 0.3

const readingCurve = (() => {
  const windows = (['EVALUATION', 'ANALYSIS', 'SUPPORT', 'INCLUSION'] as const).map(conceptWindow)
  const steps = 256
  const cumulative = new Float64Array(steps + 1)
  const [from, to] = READING_SPAN
  for (let i = 1; i <= steps; i += 1) {
    const p = from + ((to - from) * (i - 0.5)) / steps
    const holding = windows.some((w) => p >= w[1] && p <= w[2])
    cumulative[i] = cumulative[i - 1] + (holding ? HOLD_SPEED : 1)
  }
  const total = cumulative[steps]
  for (let i = 0; i <= steps; i += 1) cumulative[i] /= total
  return cumulative
})()

/** Fracción de distancia que la cámara debería llevar recorrida. */
function desiredArc(local: number) {
  const steps = readingCurve.length - 1
  const scaled = THREE.MathUtils.clamp(local, 0, 1) * steps
  const index = Math.min(Math.floor(scaled), steps - 1)
  return THREE.MathUtils.lerp(readingCurve[index], readingCurve[index + 1], scaled - index)
}

/**
 * Local lineal → local serenado dentro del tramo de lectura.
 *
 * Dos pasos: cuánta DISTANCIA debería llevar recorrida la cámara aquí, según
 * la envolvente, y qué valor del parámetro de la curva corresponde a esa
 * distancia. El segundo paso es obligatorio porque la Catmull-Rom no recorre
 * distancia uniforme: sin él un concepto se leía a 2,3 unidades por unidad de
 * progreso y otro a 12,2.
 */
function easeReading(local: number, rail: HeroRail) {
  const target = desiredArc(local)
  const table = rail.reading
  const last = table.length - 1
  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (table[middle] < target) low = middle
    else high = middle
  }
  const range = table[high] - table[low]
  return (low + (range > 1e-9 ? (target - table[low]) / range : 0)) / last
}
/*
  Emparejado de velocidad en las fronteras de plano.

  Cada plano consume 1/N de la curva ocupe el progreso que ocupe, así que su
  velocidad es 1/(N·span). Como los spans van de 0,05 a 0,32, la velocidad
  daba un escalón en cada frontera. Medido, el peor era INNER_EXIT: la cámara
  pasaba de 1,6 a 48,9 unidades de mundo por unidad de progreso de un lado al
  otro de p=0,75, con un tirón angular de 4,99. Eso es el «aquí terminó una
  animación y empezó otra».

  La corrección es una quíntica de Hermite por plano con f(0)=0 y f(1)=1 —de
  modo que los keyframes siguen cayendo EXACTAMENTE sobre su punto de control
  y ningún encuadre aprobado se mueve— y con las derivadas de los extremos
  elegidas para que la velocidad case a ambos lados. Segunda derivada nula en
  los extremos, así que tampoco hay salto de aceleración.

  No es otra capa de suavizado temporal: es la misma curva recorrida con otro
  reparto, y no toca ni Lenis ni el amortiguado del progreso.
*/
type Warp = { d0: number; d1: number }

const boundaryWarps: Warp[] = HERO_SHOTS.map((shot, index) => {
  const span = (HERO_SHOTS[index + 1]?.at ?? 1) - shot.at
  const previousSpan = index > 0 ? shot.at - HERO_SHOTS[index - 1].at : span
  const nextSpan = index + 2 < HERO_SHOTS.length
    ? HERO_SHOTS[index + 2].at - HERO_SHOTS[index + 1].at
    : span
  // Ritmo común en cada frontera: la media de los dos spans que se tocan.
  const entering = (2 * span) / Math.max(span + previousSpan, 1e-6)
  const leaving = (2 * span) / Math.max(span + nextSpan, 1e-6)
  // El recorte protege la monotonía: una quíntica con derivadas extremas
  // puede retroceder, y eso sería un rebote de cámara.
  return {
    d0: THREE.MathUtils.clamp(index === 0 ? 1 : entering, 0.25, 1.85),
    d1: THREE.MathUtils.clamp(index >= HERO_SHOTS.length - 2 ? 1 : leaving, 0.25, 1.85),
  }
})

/** Quíntica con extremos fijos, derivadas dadas y curvatura nula al borde. */
function warpLocal(local: number, warp: Warp) {
  const shortfall = 1 - warp.d0
  const tilt = warp.d1 - warp.d0
  const a3 = 10 * shortfall - 4 * tilt
  const a4 = -15 * shortfall + 7 * tilt
  const a5 = 6 * shortfall - 3 * tilt
  const x = THREE.MathUtils.clamp(local, 0, 1)
  const x2 = x * x
  const x3 = x2 * x
  return warp.d0 * x + a3 * x3 + a4 * x3 * x + a5 * x3 * x2
}

const railPosition = new THREE.Vector3()
const railLookAt = new THREE.Vector3()
const railAhead = new THREE.Vector3()
const railBehind = new THREE.Vector3()
const travelDirection = new THREE.Vector3()

/**
 * Suelo de vida: lo que el mundo hace aunque nadie toque el scroll.
 *
 * El plano APPROACH traía `neuralIntensity: 0`, `scannerIntensity: 0` y los
 * actores `neural` y `hud` casi a cero, así que el primer plano era una maqueta
 * encendida esperando un gesto. Aquí no se toca la coreografía: se combina con
 * `max`, de modo que en cuanto la curva del scroll sube por encima del suelo
 * vuelve a mandar ella y ninguna fase pierde su pico.
 *
 * Sólo entra en los canales de *vida*. Nada que mueva cámara o geometría, para
 * que `closestHeroRailDistance` y `heroEntryTravel` sigan siendo funciones
 * puras del progreso y las aserciones de encuadre no dependan del reloj.
 */
function livingFloor(time: number) {
  const slow = Math.sin(time * 0.62)
  const slower = Math.sin(time * 0.31 + 1.9)
  return {
    hud: 0.34 + slower * 0.07,
    platform: 0.58 + slow * 0.09,
  }
}

/** Resolve a reversible, deterministic frame from scroll progress and clock. */
export function resolveHeroDirector(progress: number, rail: HeroRail, radius: number, out: HeroDirectorFrame, time = 0) {
  const { index, current, next, local: rawLocal } = locateShot(progress)
  /*
    Orden: primero el emparejado de frontera y encima la envolvente de lectura.

    Al revés —envolvente y luego warp— las fronteras salen igual pero la
    dispersión entre los cuatro conceptos se dispara de 1,1x a 7,5x, con uno
    leyéndose al 4 % de la velocidad de viaje y otro al 30 %. Que los cuatro se
    lean igual pesa más que el valor absoluto.
  */
  const warped = warpLocal(rawLocal, boundaryWarps[index])
  const local = current.name === 'INFORMATION' ? easeReading(warped, rail) : warped
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

  // La plataforma física vuelve al final del cierre, no desde el primer
  // fotograma de REASSEMBLY. Antes se dibujaban sus ~99k triángulos detrás del
  // cerebro mientras todavía eran prácticamente transparentes.
  const reassemblyAt = at('REASSEMBLY')
  const institutionAt = at('INSTITUTION')
  if (progress >= reassemblyAt && progress < institutionAt) {
    const gateAt = THREE.MathUtils.lerp(reassemblyAt, institutionAt, 0.72)
    const platformReturn = ease(THREE.MathUtils.clamp(
      (progress - gateAt) / Math.max(institutionAt - gateAt, 1e-6),
      0,
      1,
    ))
    out.actorWeights.platform *= platformReturn
  }

  // La pieza de tallo entra al final del desbloqueo, cuando la abertura ya es
  // legible. Interpolar el cue desde todo UNLOCK la hacía pagar 100k triángulos
  // detrás del cerebro cerrado, sin aportar una silueta visible.
  const unlockAt = at('UNLOCK')
  const disassemblyAt = at('DISASSEMBLY')
  if (progress < disassemblyAt) {
    const gateAt = THREE.MathUtils.lerp(unlockAt, disassemblyAt, 0.72)
    const interiorReveal = ease(THREE.MathUtils.clamp(
      (progress - gateAt) / Math.max(disassemblyAt - gateAt, 1e-6),
      0,
      1,
    ))
    out.actorWeights.interior *= interiorReveal
  }

  /*
    El suelo se retira al final. El tramo de salida apaga el mundo a propósito
    —el portal tiene que quedarse solo— y mantenerlo encendido ahí convertía el
    cierre en un plano sucio.
  */
  /*
    Environment ducking.

    Mientras se lee un concepto el mundo no se apaga: baja. La cámara ya se
    serena por el reparto del tramo de lectura; aquí bajan las partículas, la
    niebla, el HUD y la electricidad. Se hace sobre los canales que el
    director ya publica, así que ningún componente necesita enterarse: los
    consumidores existentes reciben el valor ya amortiguado.
  */
  /*
    Jerarquía dentro del cerebro.

    Durante la entrada había demasiados objetos cian grandes encendidos a la
    vez: el HUD, la placa neural, los fragmentos y el núcleo competían por el
    mismo brillo y el encuadre se leía como una pared azul en vez de como
    profundidad. La distancia no se percibe añadiendo efectos, se percibe
    apagando lo que no es el protagonista.

    El núcleo mantiene su intensidad; lo demás cede.
  */
  const entry = out.entryIntensity
  if (entry > 0) {
    out.hudIntensity *= 1 - entry * 0.25
    out.fogIntensity *= 1 - entry * 0.34
    out.keyLightIntensity *= 1 - entry * 0.22
    out.rimLightIntensity *= 1 - entry * 0.28
    out.actorWeights.neural *= 1 - entry * 0.3
    out.actorWeights.hud *= 1 - entry * 0.25
    out.particleVelocity *= 1 - entry * 0.15
  }

  /*
    La actividad neuronal viene de su curva de fase, no de los valores por
    plano ni del suelo de vida. Una sola función, derivada de la línea de
    tiempo, así que ningún componente lleva su propio número.
  */
  out.neuralIntensity = getNeuralPhaseIntensity(progress)

  const reading = readingHold(progress)
  out.readingHold = reading
  if (reading > 0) {
    /*
      Ducking del tramo interior. Nada llega nunca a cero: el mundo baja de
      intensidad para que el concepto mande, no se apaga.

      Las ventanas de concepto viven todas dentro del interior, así que
      `reading` ya acota este bloque a ese tramo sin necesidad de otra puerta.

      El bloom neuronal no tiene perilla propia —es un paso global con umbral
      de luminancia— pero al bajar la intensidad de los actores neuronales su
      aportación al bloom cae en la misma proporción, que es la vía correcta:
      bajar el bloom global apagaría también el exterior, que está aprobado.
    */
    out.particleVelocity *= 1 - reading * 0.4
    out.fogIntensity *= 1 - reading * 0.55
    out.hudIntensity *= 1 - reading * 0.35
    out.neuralIntensity *= 1 - reading * 0.35
    out.actorWeights.neural *= 1 - reading * 0.3
  }

  const alive = 1 - ease(THREE.MathUtils.clamp((progress - 0.88) / 0.1, 0, 1))
  if (alive > 0) {
    const floor = livingFloor(time)
    // La electricidad ya no usa el suelo: su curva propia la cubre entera.
    out.hudIntensity = Math.max(out.hudIntensity, floor.hud * alive)
    out.platformIntensity = Math.max(out.platformIntensity, floor.platform * alive)
  }
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
  resolveHeroDirector(at('ENTRY'), rail, radius, from)
  resolveHeroDirector(at('ARRIVAL'), rail, radius, to)
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
