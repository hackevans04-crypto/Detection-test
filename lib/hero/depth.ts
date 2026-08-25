import { createHeroDirectorFrame, type HeroDirectorFrame } from './director'
import { at, conceptWindow, inside, until } from './timeline'

export { HERO_TIMELINE, at, until, inside, type HeroSegment } from './timeline'

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
  /** Reloj forzado por el arnés visual; permite comprobar vida sin scroll. */
  forcedTime: number | null
  quality: 'high' | 'medium' | 'low'
  dpr: number
  /** Escala de la resolución dinámica del compositor, 0…1. */
  renderScale: number
  pointerX: number
  pointerY: number
  stageX: number
  stageY: number
  stageRadius: number
  velocity: number
  /**
   * Energía del gesto, 0 → 1. Sube deprisa y baja despacio.
   *
   * NO toca la narrativa: ni progreso, ni cámara, ni ventanas de texto. Sólo
   * alimenta efectos secundarios —estelas de las motas de lente, turbulencia de
   * las micropartículas, velocidad de los pulsos— para que moverse deprisa se
   * SIENTA distinto de moverse despacio sin cambiar lo que se cuenta.
   */
  scrollEnergy: number
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
    forcedTime: null,
    quality: 'high',
    dpr: 1,
    renderScale: 1,
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
    scrollEnergy: 0,
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

/** La cortina atmosférica ocupa el plano inicial y se disuelve con el primer gesto. */
export const openingCloudVisibility = (progress: number) => 1 - smootherstep(inside('INTRO', 0.3), until('ACTIVATION'), progress)

/** El BrainAssembly completo permanece visible desde el primer fotograma. */
export const openingSubjectReveal = (_progress: number) => 1

/**
 * El paisaje pertenece al exterior. Desaparece antes de cruzar el cerebro,
 * regresa durante el reensamble y vuelve a ceder el plano al portal final.
 */
export const exteriorVisibility = (progress: number) => Math.max(
  1 - smootherstep(at('ENTRY'), until('ENTRY'), progress),
  smootherstep(at('INNER_EXIT'), until('REASSEMBLY'), progress) * (1 - smootherstep(at('PLATFORM'), 0.995, progress)),
)

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
 * Marcas del capítulo «01 — Inicio».
 *
 * Ya no tienen valores propios: son alias legibles de `HERO_TIMELINE`. Los
 * nombres duplicados se conservan porque hay consumidores con ambas grafías.
 */
export const PHASE = {
  APPROACH: at('INTRO'),
  ESTABLISH: at('INTRO'),
  AWAKENING: at('ACTIVATION'),
  ACTIVATE: at('ACTIVATION'),
  UNLOCK: at('UNLOCK'),
  ORBIT: at('DISASSEMBLY'),
  DISASSEMBLY: at('DISASSEMBLY'),
  MECHANICAL: at('DISASSEMBLY'),
  ENTRY: at('ENTRY'),
  INNER_FLIGHT: at('ARRIVAL'),
  INFORMATION: at('EVALUATION'),
  INFORM: at('EVALUATION'),
  REASSEMBLY: at('REASSEMBLY'),
  SYNTHESIS: at('REASSEMBLY'),
  INSTITUTION: at('INSTITUTION'),
  PLATFORM_EXIT: at('PLATFORM'),
  HANDOFF: at('PLATFORM'),
  END: until('PLATFORM'),
} as const

export type PhaseName = keyof typeof PHASE

/**
 * Disparo de la impresión por partículas de los logotipos institucionales.
 *
 * No son números sueltos: salen de los mismos tramos INSTITUTION y PLATFORM que
 * ordenan la entrada y la salida de los paneles, así que no pueden desplazarse
 * por su cuenta si el reparto del capítulo cambia.
 *
 * **Son disparadores, no carriles.** `ParticleLogo` no interpola dentro de esta
 * ventana: la usa como un interruptor con histéresis y después ejecuta la
 * impresión en el tiempo. El motivo está documentado allí —enganchada al
 * progreso, la impresión se congelaba a medias en cuanto la rueda se detenía
 * dentro de la ventana— y de ahí se sigue una consecuencia que importa aquí:
 * las DOS marcas comparten disparo. Escalonarlas separando sus ventanas dejaba
 * una impresa y la otra sin empezar en cuanto el usuario paraba entre ambas; el
 * escalonado vive ahora en el retraso temporal de cada componente.
 *
 * El disparo de entrada cae en 0,851 —ya con los paneles montados— y el de
 * salida en 0,924, con margen para que la nube termine de deshacerse ANTES de
 * que el bloque se retire en `PLATFORM_EXIT` − 0,006. Al revés, la nube se iría
 * dentro de la tarjeta y nadie llegaría a verla desaparecer: primero se
 * descomponen los logotipos, después se van los paneles.
 */
export const LOGO_PRINT = {
  print: [inside('INSTITUTION', -0.16), inside('INSTITUTION', 0.14)],
  dissolve: [inside('PLATFORM', -0.7), inside('PLATFORM', -0.4)],
} as const satisfies Record<string, readonly [number, number]>

/** Duración de un tramo, para pasarla como `duration` a los tweens. */
export const span = (from: PhaseName, to: PhaseName) => PHASE[to] - PHASE[from]

export const CONCEPT_WINDOWS = [
  conceptWindow('EVALUATION'),
  conceptWindow('ANALYSIS'),
  conceptWindow('SUPPORT'),
  conceptWindow('INCLUSION'),
] as const


/**
 * Constante de amortiguación del progreso, en segundos.
 *
 * El scroll pide `targetProgress` y la escena lo persigue con
 * `1 - exp(-dt / τ)`, que es independiente de los fotogramas por segundo.
 *
 * Va en serie con el suavizado de Lenis, así que las dos constantes se
 * suman en la sensación. Con Lenis ya corregido a τ ≈ 75 ms, éste baja a 32
 * para que el total quede en el entorno de los 110 ms y el 90 % del
 * recorrido se cubra en poco más de 250 ms. El peso cinematográfico lo pone
 * el reparto del capítulo, no la viscosidad del control.
 */
export const PROGRESS_DAMPING = 0.032

/**
 * Longitud del capítulo en múltiplos de viewport.
 *
 * ACTUALIZADO: de 7,7 a 5,6 en escritorio. El número seguía saliendo de la
 * misma cuenta de legibilidad, pero se había calculado contra una meseta de
 * lectura de 0,036 y las ventanas de concepto miden hoy 0,0504 —los tramos se
 * ensancharon al repartir el capítulo—. Con 5,6 vh, esa meseta son 254 px en un
 * viewport de 900: dos muescas y media de rueda, que sigue siendo más que un
 * evento y por tanto sigue sin poder saltarse ningún texto.
 *
 * Lo que se corrige con esto es la SEGUNDA causa de que el capítulo se sintiera
 * lento. La primera era el fotograma —el bloom a resolución completa costaba
 * más que todo lo demás junto— y ésta es la distancia: a 7,7 vh el recorrido
 * medía 6930 px y volver arriba costaba lo mismo que bajar. El reparto interno
 * no cambia, sólo la escala.
 *
 * El número no es de gusto: sale de las ventanas de texto. Un concepto de
 * `CONCEPT_WINDOWS` mide 0,06 de progreso y su hold legible 0,036. Con el
 * capítulo a 1,3 vh el recorrido completo eran 1404 px, así que un tick de
 * rueda —100 px en Chrome— avanzaba Δp = 0,071: más que la ventana entera del
 * concepto. Es decir, un solo gesto normal cruzaba entrada, hold y salida y el
 * texto no llegaba a poder leerse nunca. No era una sensación, era aritmética.
 *
 * Despejando al revés: para que el hold de un concepto ocupe tres ticks hacen
 * falta 100 × 3 / (0,036 × alto de viewport) ≈ 7,7 vh. Ése es el suelo, y de
 * ahí sale este valor.
 *
 * La nota anterior decía que 300vh se había probado y dejaba la secuencia
 * «trabada». Con esta cuenta delante se entiende por qué no arregló nada: a 3
 * vh el tick seguía valiendo Δp = 0,031, todavía más de la mitad del hold. El
 * problema no era la longitud en sí, era que seguía por debajo del mínimo.
 *
 * REVISADO. 7,7 vh resolvían la legibilidad pero pedían 83 muescas de rueda
 * para recorrer el capítulo entero, y eso se siente como que la página no
 * avanza. La corrección no es sólo acortar —eso roba lectura en la misma
 * proporción— sino acortar un poco Y hacer la sensibilidad de la rueda
 * adaptativa en `smooth-scroll`: quien arrastra sostenido recorre, quien da un
 * toque suelto conserva el grano fino. Ver ahí el porqué.
 *
 * Ojo: estirar el recorrido **no** llena por sí solo el tramo de contemplación
 * inicial. Al alargarlo, el 0 → 0,32 —donde hoy apenas cambia nada— pasa a
 * ocupar dos viewports y medio. Eso lo tiene que llenar la vida en reposo de la
 * escena, no el scroll.
 */
export function chapterLength(width: number) {
  // En táctil un solo desliz recorre mucho más que un tick de rueda, así que el
  // mismo umbral de legibilidad se alcanza con menos recorrido.
  if (width < 901) return 4.4
  if (width < 1280) return 5.0
  return 5.6
}
