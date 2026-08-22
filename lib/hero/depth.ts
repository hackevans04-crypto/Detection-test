import { createHeroDirectorFrame, type HeroDirectorFrame } from './director'

/**
 * Estado y marcas de tiempo del capítulo «Inicio».
 *
 * El modelo de profundidad en CSS que vivía aquí —una tabla de Z y amplitudes
 * de puntero por capa— desapareció con el mundo DOM: ahora la profundidad la
 * define `lib/hero/stage.ts` en unidades de mundo y el parallax lo produce la
 * perspectiva de una única cámara.
 */

/**
 * Estado compartido entre la interfaz DOM y la escena WebGL.
 *
 * Es un objeto mutable a propósito: se escribe desde `pointermove` y desde el
 * `onUpdate` de ScrollTrigger, y se lee dentro de `useFrame`. Pasar esto por
 * estado de React provocaría un render por frame.
 */
export type HeroSceneState = {
  /**
   * Progreso amortiguado del capítulo, 0 → 1. Es el que lee toda la escena.
   *
   * No es el que publica ScrollTrigger: ése va en `targetProgress`. La
   * diferencia entre los dos es lo que da peso a la cámara sin volverla
   * viscosa; ver `PROGRESS_DAMPING`.
   */
  progress: number
  /** Progreso crudo que pide el scroll. Sólo lo escribe ScrollTrigger. */
  targetProgress: number
  /**
   * Reloj de la escena, en segundos. Todo lo que respira lee esto y no
   * `clock.elapsedTime`: en modo de prueba se congela en un valor fijo y dos
   * capturas del mismo progreso salen idénticas.
   */
  time: number
  /** Progreso forzado por `?heroTest=1&p=`; `null` cuando manda el scroll. */
  forcedProgress: number | null
  quality: 'high' | 'medium' | 'low'
  dpr: number
  pointerX: number
  pointerY: number
  stageX: number
  stageY: number
  stageRadius: number
  velocity: number
  cameraPosition: [number, number, number]
  cameraFov: number
  lookAt: [number, number, number]
  /** Distancia real cámara → centro del cerebro, en múltiplos del radio. */
  cameraDistanceR: number
  brainPosition: [number, number, number]
  brainRotation: [number, number, number]
  brainScale: number
  brainOpacity: number
  brainBounds: [number, number, number]
  brainRadius: number
  /**
   * Altura aparente del cerebro como fracción del viewport.
   *
   * Es la métrica de encuadre del capítulo: la dirección pide que no pase de
   * 0,68 en el punto más cercano y que viva entre 0,45 y 0,60. Se publica cada
   * frame para poder verificarlo sin abrir el navegador.
   */
  brainScreenHeight: number
  platformPosition: [number, number, number]
  platformRotation: [number, number, number]
  platformScale: number
  fogOpacity: number
  lightLevel: number
  particleCount: number
  activeHotspot: string
  drawCalls: number
  triangles: number
  activeGlb: string
  /** Fotograma cinematográfico resuelto exclusivamente por HeroDirector. */
  director: HeroDirectorFrame
}

/**
 * Estado de una sola instancia del capítulo. Nunca se comparte entre montajes:
 * al volver a Inicio la escena siempre arranca en el fotograma aprobado.
 */
export function createHeroSceneState(): HeroSceneState {
  return {
    progress: 0,
    targetProgress: 0,
    time: 0,
    forcedProgress: null,
    quality: 'high',
    dpr: 1,
    /** Puntero normalizado a [-0.5, 0.5]. */
    pointerX: 0,
    pointerY: 0,
    /** Centro del cerebro en coordenadas de viewport normalizadas (0 → 1). */
    stageX: 0.65,
    stageY: 0.5,
    /** Radio del cerebro como fracción de la altura del viewport. */
    stageRadius: 0.22,
    /** Reacción secundaria normalizada a la velocidad de la rueda. */
    velocity: 0,
    cameraPosition: [0, 0, 7.35],
    cameraFov: 38,
    lookAt: [0, 0, 0],
    cameraDistanceR: 6,
    brainPosition: [0, 0, 0],
    brainRotation: [0, 0, 0],
    brainScale: 1,
    brainOpacity: 1,
    brainBounds: [0, 0, 0],
    brainRadius: 0,
    brainScreenHeight: 0,
    platformPosition: [0, 0, 0],
    platformRotation: [0, 0, 0],
    platformScale: 1,
    fogOpacity: 0.2,
    lightLevel: 1,
    particleCount: 678,
    activeHotspot: '—',
    drawCalls: 0,
    triangles: 0,
    activeGlb: '6 actores continuos',
    director: createHeroDirectorFrame(),
  }
}

/* ------------------------------------------------------------------ curvas */

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

/** Posición de `value` dentro de [from, to], recortada a 0…1. */
export const range = (value: number, from: number, to: number) =>
  clamp01((value - from) / Math.max(to - from, 0.0001))

/**
 * Interpolación suave con derivada nula en los extremos.
 *
 * Es la que debe usarse por defecto en la coreografía. Con `range` a secas —una
 * rampa lineal— cada tramo arranca y frena de golpe, y encadenados se notan las
 * costuras: la cámara parece cambiar de idea en cada marca.
 */
export function smoothstep(from: number, to: number, value: number) {
  const t = range(value, from, to)
  return t * t * (3 - 2 * t)
}

/** Como `smoothstep`, pero también con segunda derivada nula. Para la cámara. */
export function smootherstep(from: number, to: number, value: number) {
  const t = range(value, from, to)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Traslada `value` del intervalo de entrada al de salida, sin recortar fuera. */
export const remap = (value: number, fromA: number, fromB: number, toA: number, toB: number) =>
  toA + (toB - toA) * range(value, fromA, fromB)

export const fadeIn = (value: number, from: number, to: number) => range(value, from, to)
export const fadeOut = (value: number, from: number, to: number) => 1 - range(value, from, to)

/** Rampa de subida y bajada con los tres puntos suavizados. */
export const bell = (value: number, from: number, peak: number, to: number) =>
  value <= peak ? smoothstep(from, peak, value) : 1 - smoothstep(peak, to, value)

/* ------------------------------------------------------------------ fases */

/**
 * Marcas del capítulo «01 — Inicio», en fracción del recorrido de scroll.
 *
 * Son los cortes de la coreografía, no secciones de la web: el indicador
 * lateral permanece en 01 durante todas ellas.
 *
 * La secuencia es observar → aproximarse → orbitar → descubrir → sintetizar →
 * institución → descender. **No hay fase de entrar en el cerebro.** La hubo, y
 * el resultado era un zoom que convertía los dos hemisferios en dos paredes:
 * se perdía la silueta y con ella la lectura de qué se estaba mirando.
 */
export const PHASE = {
  /** Plano de situación. La composición aprobada, viva pero tranquila. */
  APPROACH: 0,
  ESTABLISH: 0,
  /** Activación: la escena despierta con un acercamiento corto. */
  AWAKENING: 0.08,
  ACTIVATE: 0.08,
  /** Órbita lateral: es el tramo que demuestra que hay volumen de verdad. */
  UNLOCK: 0.18,
  ORBIT: 0.3,
  /** El cerebro híbrido cede al volumen orgánico completo. */
  DISASSEMBLY: 0.3,
  MECHANICAL: 0.3,
  ENTRY: 0.43,
  INNER_FLIGHT: 0.56,
  /** Los cuatro conceptos, alrededor del cerebro. */
  INFORMATION: 0.7,
  INFORM: 0.7,
  /** Síntesis: los cuatro a la vez y la cámara retrocede. */
  REASSEMBLY: 0.8,
  SYNTHESIS: 0.8,
  /** UTEQ + Olbrox, con el cerebro entre ambos. */
  INSTITUTION: 0.88,
  /** Descenso hacia la plataforma y entrega al capítulo 02. */
  PLATFORM_EXIT: 0.95,
  HANDOFF: 0.95,
  END: 1,
} as const

export type PhaseName = keyof typeof PHASE

/** Duración de un tramo, para pasarla como `duration` a los tweens. */
export const span = (from: PhaseName, to: PhaseName) => PHASE[to] - PHASE[from]

/**
 * Ventanas de los cuatro conceptos, encadenadas dentro del tramo de
 * información. Las comparten el texto DOM y sus nodos 3D, para que se
 * enciendan exactamente en el mismo punto del recorrido.
 */
export const CONCEPT_WINDOWS = [
  [0.58, 0.625],
  [0.625, 0.67],
  [0.67, 0.715],
  [0.715, 0.76],
] as const

/**
 * Constante de amortiguación del progreso, en segundos.
 *
 * El scroll pide `targetProgress` y la escena lo persigue con
 * `1 - exp(-dt / τ)`. Con τ = 0,072 el 95 % del recorrido se cubre en ~215 ms:
 * hay peso, pero la escena responde al gesto. El valor anterior equivalía a
 * más de medio segundo y se sentía como viscosidad, no como inercia.
 */
export const PROGRESS_DAMPING = 0.06

/**
 * Longitud del capítulo en múltiplos de viewport.
 *
 * ~190vh en escritorio: cuatro a seis gestos de rueda normales. Se probó a
 * 300vh y el efecto fue el contrario del buscado —cada gesto avanzaba tan poco
 * que la secuencia parecía trabada—. Lo que llena un capítulo no es recorrido
 * de scroll, sino cosas que se mueven por unidad de recorrido.
 */
export function chapterLength(width: number) {
  if (width < 900) return 1.08
  if (width < 1280) return 1.1
  return 1.12
}
