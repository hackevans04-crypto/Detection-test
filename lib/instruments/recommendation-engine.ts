import { recommendableInstruments } from '@/instruments/catalog'
import type { Instrument } from '@/instruments/types'
import { completedAreas } from '@/lib/evaluations/functional-areas'
import type { Evaluation } from '@/lib/evaluations/model'
import { evaluateInstrumentEligibility, type EligibilityResult } from '@/lib/instruments/eligibility-engine'

/**
 * Motor de recomendación de instrumentos.
 *
 * Recomendar es afirmar que un instrumento procede para este caso. Un
 * instrumento que después hay que justificar para poder aplicar nunca fue una
 * recomendación: la incompatibilidad se descarta *antes* de puntuar, no se
 * muestra con una advertencia encima.
 *
 * El motor no rellena. Si nada supera el umbral devuelve una lista vacía, y la
 * pantalla dice que no hay instrumentos pertinentes. No existe respaldo: ni
 * catálogo de reserva, ni sugerencia por defecto, ni instrumento de ejemplo.
 */

export type RelevanceLevel = 'Pertinencia alta' | 'Pertinencia media' | 'Complementario'

export type InstrumentRecommendation = {
  instrument: Instrument
  relevance: RelevanceLevel
  /** Puntuación interna del ranking. Se muestra el nivel, no el número. */
  score: number
  /** Áreas exploradas del expediente que este instrumento cubre. */
  matchedAreas: string[]
  /** Qué del expediente sostiene la recomendación. Frases cortas, no párrafos. */
  criteria: string[]
  eligibility: EligibilityResult
}

/** Puntuación mínima para aparecer como recomendado. Por debajo, no se muestra. */
const MINIMUM_SCORE = 3

const AREA_WEIGHT = 2
const REASON_WEIGHT = 1
const FULL_COMPATIBILITY_WEIGHT = 1

/** Sólo estas compatibilidades pueden llegar a ser candidatas. */
function isCandidate(eligibility: EligibilityResult) {
  return eligibility.status === 'COMPATIBLE' || eligibility.status === 'COMPATIBLE_WITH_WARNING'
}

function matchedAreasFor(evaluation: Evaluation, instrument: Instrument) {
  const observed = completedAreas(evaluation).map((area) => area.label.toLowerCase())
  return instrument.areas.filter((area) => {
    const normalized = area.toLowerCase()
    return observed.some((candidate) => normalized.includes(candidate) || candidate.includes(normalized))
  })
}

function levelFor(score: number): RelevanceLevel {
  if (score >= 6) return 'Pertinencia alta'
  if (score >= 4) return 'Pertinencia media'
  return 'Complementario'
}

/**
 * Instrumentos pertinentes para el caso, ordenados por pertinencia.
 *
 * Sólo entra un instrumento publicado, compatible con la edad registrada y con
 * al menos un área del expediente cubierta. Sin áreas exploradas no hay
 * pertinencia que medir y el resultado es vacío, que es la respuesta correcta.
 */
export function recommendInstruments(evaluation: Evaluation): InstrumentRecommendation[] {
  const hasReason = evaluation.referral.reason.trim().length > 0

  return recommendableInstruments()
    .map((instrument) => ({ instrument, eligibility: evaluateInstrumentEligibility(evaluation, instrument) }))
    .filter(({ eligibility }) => isCandidate(eligibility))
    .map(({ instrument, eligibility }) => {
      const matchedAreas = matchedAreasFor(evaluation, instrument)
      const score =
        matchedAreas.length * AREA_WEIGHT +
        (hasReason ? REASON_WEIGHT : 0) +
        (eligibility.status === 'COMPATIBLE' ? FULL_COMPATIBILITY_WEIGHT : 0)

      const criteria = [
        ...matchedAreas.map((area) => `Área explorada: ${area}`),
        ...(hasReason ? ['Motivo de evaluación registrado'] : []),
        `Edad cronológica dentro del rango del instrumento (${instrument.rangoTexto})`,
      ]

      return { instrument, eligibility, matchedAreas, score, criteria, relevance: levelFor(score) }
    })
    .filter((candidate) => candidate.matchedAreas.length > 0 && candidate.score >= MINIMUM_SCORE)
    .sort((a, b) => b.score - a.score || a.instrument.nombre.localeCompare(b.instrument.nombre))
}
