/**
 * La línea de tiempo del capítulo «01 — Inicio». **Única fuente de verdad.**
 *
 * Antes había tres juegos de números diciendo lo mismo y con permiso para
 * contradecirse: las marcas `at` de `HERO_SHOTS`, las constantes de `PHASE` y
 * las ventanas de `CONCEPT_WINDOWS`, más una veintena de umbrales sueltos
 * escritos a mano contra los valores viejos. Todo eso se deriva ahora de esta
 * tabla y nada vuelve a copiar un número.
 *
 * Vive en su propio módulo a propósito: `depth.ts` importa de `director.ts` y
 * `director.ts` necesita estos rangos, así que ponerlos en cualquiera de los
 * dos cerraba un ciclo de imports que reventaría al evaluar `HERO_SHOTS`.
 * Este fichero no importa de nadie.
 *
 * El reparto NO es uniforme, y ahí está todo el ritmo. En esta arquitectura
 * cada plano consume 1/10 de la curva de cámara pase lo que pase, de modo que
 * su velocidad visual es exactamente `0,1 / span`. Estrechar un tramo lo
 * acelera y ensancharlo lo frena. Por eso no hace falta —ni debe añadirse— un
 * multiplicador de velocidad por encima: sería una segunda verdad compitiendo
 * con ésta, que es justo el problema que esta tabla viene a cerrar.
 *
 * Reparto actual: el viaje exterior y la entrada ocupan el primer 38 %; después
 * cada concepto recibe exactamente 0,10 de progreso. El 80 % de su ventana
 * activa queda estable para leer, sin alargar la longitud total del capítulo.
 * La salida interior, el reensamble, la institución y el portal conservan ese
 * orden en el 22 % final.
 */
export const HERO_TIMELINE = {
  INTRO: [0, 0.07],
  ACTIVATION: [0.07, 0.12],
  UNLOCK: [0.12, 0.18],
  DISASSEMBLY: [0.18, 0.27],
  ENTRY: [0.27, 0.35],
  ARRIVAL: [0.35, 0.38],
  EVALUATION: [0.38, 0.48],
  ANALYSIS: [0.48, 0.58],
  SUPPORT: [0.58, 0.68],
  INCLUSION: [0.68, 0.78],
  INNER_EXIT: [0.78, 0.83],
  REASSEMBLY: [0.83, 0.88],
  INSTITUTION: [0.88, 0.97],
  PLATFORM: [0.97, 1],
} as const satisfies Record<string, readonly [number, number]>

export type HeroSegment = keyof typeof HERO_TIMELINE

/** Inicio de un tramo. */
export const at = (segment: HeroSegment) => HERO_TIMELINE[segment][0]

/** Final de un tramo. */
export const until = (segment: HeroSegment) => HERO_TIMELINE[segment][1]

/** Punto interior de un tramo, en fracción de su propia duración. */
export const inside = (segment: HeroSegment, fraction: number) => {
  const [from, to] = HERO_TIMELINE[segment]
  return from + (to - from) * fraction
}

/**
 * Ventana de lectura de un concepto: [entra, fin de entrada, fin del hold, sale].
 *
 * Reserva un 3 % a cada lado como hueco de respiración —ese instante sin texto
 * entre concepto y concepto es lo que los separa mentalmente— y reparte el
 * resto en 10 % de entrada, 80 % de lectura estable y 10 % de salida. Durante
 * el hold el texto no se transforma: se lee.
 */
export const conceptWindow = (segment: HeroSegment) => {
  const [start, end] = HERO_TIMELINE[segment]
  const pad = (end - start) * 0.03
  const from = start + pad
  const to = end - pad
  const inner = to - from
  return [from, from + inner * 0.1, from + inner * 0.9, to] as const
}

/**
 * Cuánto manda la lectura en este punto del capítulo, de 0 a 1.
 *
 * Vale 1 en el centro del hold de un concepto y cae a 0 en sus bordes. Es la
 * señal que serena el mundo mientras se lee: la escena no se apaga, baja de
 * intensidad para que el texto deje de competir con ella. Sale de las mismas
 * ventanas que usa el propio texto, así que no pueden desincronizarse.
 */
export const readingHold = (progress: number) => {
  for (const segment of ['EVALUATION', 'ANALYSIS', 'SUPPORT', 'INCLUSION'] as const) {
    const [, holdFrom, holdTo] = conceptWindow(segment)
    if (progress < holdFrom || progress > holdTo) continue
    // Rampa suave en los extremos del hold: entrar y salir del silencio no
    // debe notarse como un interruptor.
    const edge = (holdTo - holdFrom) * 0.28
    const rise = Math.min((progress - holdFrom) / edge, 1)
    const fall = Math.min((holdTo - progress) / edge, 1)
    const weight = Math.min(rise, fall)
    return weight * weight * (3 - 2 * weight)
  }
  return 0
}

/** Los cuatro conceptos, en orden. */
export const CONCEPT_SEGMENTS = ['EVALUATION', 'ANALYSIS', 'SUPPORT', 'INCLUSION'] as const

/**
 * Dónde empieza a prepararse un concepto, antes de que su texto entre.
 *
 * La rampa de entrada de la ventana mide 90 px de scroll —menos de un tick de
 * rueda—, y ahí no caben nodo, conector, partículas, índice, título y
 * descripción: todo ocurría a la vez y se leía como una activación instantánea.
 *
 * El pre-roll no le quita nada al hold: vive en el VIAJE ANTERIOR. Durante ese
 * tramo se carga el nodo, empieza a dibujarse el filamento y salen las primeras
 * partículas, pero el texto todavía no aparece. Así el usuario entiende que
 * algo está por llegar en vez de encontrárselo.
 *
 * Nunca invade al concepto anterior: no puede empezar hasta que ése lleve más
 * de la mitad de su salida, de modo que jamás hay dos plenamente visibles.
 */
const PRE_ROLL = 0.018

export function conceptApproach(index: number) {
  const segment = CONCEPT_SEGMENTS[index]
  const [start] = conceptWindow(segment)
  const wanted = start - PRE_ROLL
  if (index === 0) return wanted
  const previous = conceptWindow(CONCEPT_SEGMENTS[index - 1])
  // El anterior tiene que llevar ya más del 55 % de su salida.
  const previousExitPast = previous[2] + (previous[3] - previous[2]) * 0.55
  return Math.max(wanted, previousExitPast)
}

/**
 * Intensidad de la actividad neuronal a lo largo del capítulo.
 *
 * Función única y derivada de esta misma tabla: ningún componente vuelve a
 * llevar su propio número. Sustituye al suelo de vida que había en el director,
 * que era un parche para que el cerebro no muriera en reposo.
 *
 * La forma cuenta la historia: despierta al activarse, hace pico justo antes de
 * abrirse, se calma al entrar —la atención pasa de la superficie al interior—,
 * baja aún más mientras hay algo que leer, vuelve a crecer para reunir las
 * piezas y cede el plano en la institución.
 *
 * Interpolación suavizada entre claves, nunca escalones.
 */
const NEURAL_KEYS: ReadonlyArray<readonly [number, number]> = [
  [at('INTRO'), 0.42],
  [at('ACTIVATION'), 0.68],
  [at('UNLOCK'), 0.9],
  [at('DISASSEMBLY'), 0.8],
  [at('ENTRY'), 0.62],
  [at('ARRIVAL'), 0.52],
  [at('EVALUATION'), 0.5],
  [at('INNER_EXIT'), 0.58],
  [at('REASSEMBLY'), 0.72],
  [at('INSTITUTION'), 0.35],
  [at('PLATFORM'), 0.2],
  [until('PLATFORM'), 0.12],
]

export function getNeuralPhaseIntensity(progress: number) {
  if (progress <= NEURAL_KEYS[0][0]) return NEURAL_KEYS[0][1]
  for (let index = 1; index < NEURAL_KEYS.length; index += 1) {
    const [toAt, toValue] = NEURAL_KEYS[index]
    if (progress > toAt) continue
    const [fromAt, fromValue] = NEURAL_KEYS[index - 1]
    const span = Math.max(toAt - fromAt, 1e-6)
    const t = Math.min(Math.max((progress - fromAt) / span, 0), 1)
    // Smootherstep: sin salto de valor ni de pendiente en las claves.
    const eased = t * t * t * (t * (t * 6 - 15) + 10)
    return fromValue + (toValue - fromValue) * eased
  }
  return NEURAL_KEYS[NEURAL_KEYS.length - 1][1]
}
