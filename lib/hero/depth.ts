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
  progress: number
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
  brainPosition: [number, number, number]
  brainRotation: [number, number, number]
  brainScale: number
  brainOpacity: number
  brainBounds: [number, number, number]
  brainRadius: number
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
}

/**
 * Estado de una sola instancia del capítulo. Nunca se comparte entre montajes:
 * al volver a Inicio la escena siempre arranca en el fotograma aprobado.
 */
export function createHeroSceneState(): HeroSceneState {
  return {
  /** Progreso del capítulo, 0 → 1. */
  progress: 0,
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
  cameraFov: 40,
  lookAt: [0, 0, 0],
  brainPosition: [0, 0, 0],
  brainRotation: [0, 0, 0],
  brainScale: 1,
  brainOpacity: 1,
  brainBounds: [0, 0, 0],
  brainRadius: 0,
  platformPosition: [0, 0, 0],
  platformRotation: [0, 0, 0],
  platformScale: 1,
  fogOpacity: 0.2,
  lightLevel: 1,
  particleCount: 469,
  activeHotspot: '—',
  drawCalls: 0,
  triangles: 0,
  activeGlb: 'brain-neon-final.glb',
  }
}

export const range = (value: number, from: number, to: number) =>
  Math.max(0, Math.min(1, (value - from) / Math.max(to - from, 0.0001)))

export const fadeIn = (value: number, from: number, to: number) => range(value, from, to)
export const fadeOut = (value: number, from: number, to: number) => 1 - range(value, from, to)
export const bell = (value: number, from: number, peak: number, to: number) =>
  value <= peak ? fadeIn(value, from, peak) : fadeOut(value, peak, to)

/**
 * Marcas del capítulo «01 — Inicio», en fracción del recorrido de scroll.
 *
 * Son los cortes de la coreografía, no secciones de la web: el indicador
 * lateral permanece en 01 durante todas ellas.
 */
export const PHASE = {
  /** Hero visible: la escena vive, el texto se lee. */
  CONTEMPLATE: 0,
  /** La niebla frontal se abre como una ventana. */
  CLEAR: 0.16,
  /** Pulsos, arcos de datos y escáner. */
  ACTIVATE: 0.3,
  /** Los hemisferios se separan. */
  OPEN: 0.46,
  /** La cámara avanza entre ellos. */
  ENTER: 0.52,
  /** Recorrido por los cuatro nodos internos. */
  NAVIGATE: 0.58,
  /** Núcleo: las rutas convergen. */
  CORE: 0.64,
  /** La cámara atraviesa el núcleo y sale. */
  EXIT: 0.7,
  /** UTEQ + Olbrox. */
  INSTITUTION: 0.78,
  /** Entrega al capítulo 02. */
  HANDOFF: 0.9,
  END: 1,
} as const

export type PhaseName = keyof typeof PHASE

/** Duración de un tramo, para pasarla como `duration` a los tweens. */
export const span = (from: PhaseName, to: PhaseName) => PHASE[to] - PHASE[from]

/**
 * Longitud del capítulo en múltiplos de viewport.
 *
 * El valor anterior (1.05) permitía terminar Inicio con dos golpes de rueda.
 * Todo este recorrido controla una única escena fijada: no añade hueco vacío.
 */
export function chapterLength(width: number) {
  // ~240vh en escritorio: 4–7 gestos de rueda normales. Recorridos mayores
  // hacían falta cuando la narrativa era una sucesión de composiciones; con
  // la cámara entrando en el cerebro, alargarlo sólo lo volvería lento.
  if (width < 900) return 1.65
  if (width < 1280) return 1.85
  return 2
}
