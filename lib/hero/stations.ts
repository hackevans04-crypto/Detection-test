import { conceptWindow, at, inside, until } from './timeline'

/**
 * Las estaciones del capítulo.
 *
 * El Hero deja de ser un vídeo que se arrastra con la rueda. Un gesto significa
 * «siguiente momento narrativo», y el sistema viaja solo hasta él y se detiene.
 *
 * Esto NO sustituye a `HERO_TIMELINE` ni a la coreografía: las estaciones sólo
 * dicen a qué progreso hay que viajar. Todo lo que ocurre entre dos progresos
 * —cámara, cerebro, niebla, textos— sigue siendo exactamente lo mismo de antes.
 *
 * Las cuatro estaciones de concepto caen en el CENTRO del hold, no en su
 * entrada: es el punto en el que el texto está completo, quieto y legible, que
 * es donde el viaje tiene que terminar.
 */
const holdCentre = (segment: Parameters<typeof conceptWindow>[0]) => {
  const [, holdFrom, holdTo] = conceptWindow(segment)
  return (holdFrom + holdTo) / 2
}

export type StationName =
  | 'INTRO'
  | 'ACTIVATION'
  | 'UNLOCK'
  | 'ENTRY'
  | 'EVALUATION'
  | 'ANALYSIS'
  | 'ACCOMPANIMENT'
  | 'INCLUSION'
  | 'INSTITUTION'
  | 'PLATFORM'

export type Station = {
  name: StationName
  progress: number
}

export const STATIONS: readonly Station[] = [
  { name: 'INTRO', progress: at('INTRO') },
  { name: 'ACTIVATION', progress: inside('ACTIVATION', 0.6) },
  { name: 'UNLOCK', progress: inside('UNLOCK', 0.7) },
  { name: 'ENTRY', progress: inside('ENTRY', 0.75) },
  { name: 'EVALUATION', progress: holdCentre('EVALUATION') },
  { name: 'ANALYSIS', progress: holdCentre('ANALYSIS') },
  { name: 'ACCOMPANIMENT', progress: holdCentre('SUPPORT') },
  { name: 'INCLUSION', progress: holdCentre('INCLUSION') },
  { name: 'INSTITUTION', progress: inside('INSTITUTION', 0.55) },
  { name: 'PLATFORM', progress: until('PLATFORM') },
] as const

/** Etiqueta corta para el indicador de capítulo del nav. */
export const STATION_LABEL: Record<StationName, string> = {
  INTRO: 'Inicio',
  ACTIVATION: 'Activación',
  UNLOCK: 'Apertura',
  ENTRY: 'Exploración neural',
  EVALUATION: 'Evaluación',
  ANALYSIS: 'Análisis',
  ACCOMPANIMENT: 'Acompañamiento',
  INCLUSION: 'Inclusión',
  INSTITUTION: 'Institución',
  PLATFORM: 'Plataforma',
}

/**
 * Duración del viaje entre dos estaciones, en segundos.
 *
 * Se deriva de la distancia recorrida, no de una tabla fija: dos estaciones
 * contiguas no pueden tardar lo mismo que un salto largo, o los tramos cortos
 * se sienten artificialmente lentos. Los topes evitan tanto el corte seco como
 * la eternidad.
 */
export function stationDuration(from: number, to: number) {
  const distance = Math.abs(to - from)
  const seconds = 0.78 + distance * 3.4
  return Math.min(Math.max(seconds, 0.9), 1.45)
}

/**
 * Curva de viaje de la cámara.
 *
 * La anterior era una quíntica de salida: frenaba desde el primer instante,
 * así que la toma se consumía enseguida y parecía un salto corto en vez de un
 * dolly. Ésta encoda el perfil que pide la dirección —arranque rápido, tramo
 * de crucero largo, frenada progresiva y posada muy suave— integrando una
 * curva de VELOCIDAD y normalizando el resultado.
 *
 * La velocidad nunca llega a cero al final: se posa al 15 %, que es lo que
 * evita que la llegada se sienta como un tope.
 */
const TRAVEL_STEPS = 160
const travelCurve = (() => {
  const smooth = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
    return t * t * (3 - 2 * t)
  }
  const cumulative = new Float64Array(TRAVEL_STEPS + 1)
  for (let i = 1; i <= TRAVEL_STEPS; i += 1) {
    const t = (i - 0.5) / TRAVEL_STEPS
    const rise = smooth(0, 0.14, t)
    const fall = 0.15 + 0.85 * (1 - smooth(0.62, 0.97, t))
    cumulative[i] = cumulative[i - 1] + rise * fall
  }
  const total = cumulative[TRAVEL_STEPS] || 1
  for (let i = 0; i <= TRAVEL_STEPS; i += 1) cumulative[i] /= total
  return cumulative
})()

/** Easing del viaje entre estaciones. */
export function travelEasing(t: number) {
  const scaled = Math.min(Math.max(t, 0), 1) * TRAVEL_STEPS
  const index = Math.min(Math.floor(scaled), TRAVEL_STEPS - 1)
  const fraction = scaled - index
  return travelCurve[index] + (travelCurve[index + 1] - travelCurve[index]) * fraction
}

/** Estación más cercana a un progreso dado. Sirve para recolocar tras resize. */
export function nearestStation(progress: number) {
  let best = 0
  for (let index = 1; index < STATIONS.length; index += 1) {
    if (Math.abs(STATIONS[index].progress - progress) < Math.abs(STATIONS[best].progress - progress)) best = index
  }
  return best
}
