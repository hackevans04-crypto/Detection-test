import type { EvaluationInstrument, InstrumentBlueprint } from '@/lib/evaluations/model'

/**
 * Motor de cálculo determinista.
 *
 * No hay LLM aquí ni en ninguna parte de este archivo: la única entrada es el
 * blueprint validado, las puntuaciones ya capturadas y los baremos que un
 * profesional confirmó. La misma entrada produce siempre la misma salida.
 *
 * Alcance deliberado, más acotado que "ejecutar cualquier fórmula del Excel":
 * hoy el sistema captura la puntuación directa que el profesional registra
 * (a mano, o —cuando exista digitalización de respuestas— derivada de ellas),
 * nunca ítems sueltos, así que este motor no suma ítems: busca esa puntuación
 * directa en la tabla de baremo confirmada y deriva de ahí la puntuación
 * transformada, el percentil y la clasificación. Sin baremo confirmado, o sin
 * un tramo que cubra el valor registrado, la medida se marca no calculable en
 * vez de inventar un resultado.
 */

export type ComputedMeasure = {
  measureId: string
  label: string
  subtestId: string | null
  rawScore: number | null
  scaledScore: number | null
  percentile: number | null
  classification: string | null
  computable: boolean
  /** Por qué no se pudo calcular, cuando no se pudo. */
  reason: string | null
}

export type InstrumentScoreResult = {
  engineVersion: 'deterministic-v1'
  computedAt: string
  /** Medida principal: la primera puntuación global (sin subtest) que un baremo resolvió. */
  overall: ComputedMeasure | null
  /** Resultados por subtest, cuando el blueprint los declara. */
  subscales: ComputedMeasure[]
  /** Otras medidas globales resueltas por baremo, además de la principal. */
  indices: ComputedMeasure[]
  /** Medidas con valor capturado pero sin baremo confirmado que las resuelva. */
  otherMeasures: ComputedMeasure[]
}

function parseNumber(value: string | undefined): number | null {
  if (!value || !value.trim()) return null
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Requiere un blueprint validado: sin eso, no hay reglas de corrección que
 * puedan considerarse acordadas, y este motor no calcula nada.
 */
export function scoreInstrument(
  blueprint: InstrumentBlueprint | null,
  entry: EvaluationInstrument,
): InstrumentScoreResult | null {
  if (!blueprint || blueprint.status !== 'VALIDATED') return null

  const measuresById = new Map(blueprint.measures.map((measure) => [measure.id, measure]))
  const resolvedMeasureIds = new Set<string>()
  const computed: ComputedMeasure[] = []

  for (const baremo of blueprint.baremos) {
    // Sin confirmar, el baremo no cuenta para el cálculo: es un borrador.
    if (!baremo.confirmedAt) continue

    const sourceMeasure = measuresById.get(baremo.sourceMeasureId)
    if (!sourceMeasure) continue

    const rawScore = parseNumber(entry.scores[baremo.sourceMeasureId]?.value)
    resolvedMeasureIds.add(baremo.sourceMeasureId)

    if (rawScore === null) {
      computed.push({
        measureId: baremo.sourceMeasureId,
        label: sourceMeasure.label,
        subtestId: sourceMeasure.subtestId,
        rawScore: null,
        scaledScore: null,
        percentile: null,
        classification: null,
        computable: false,
        reason: 'Sin puntuación directa registrada.',
      })
      continue
    }

    const band = baremo.bands.find((candidate) => {
      const min = candidate.min ?? Number.NEGATIVE_INFINITY
      const max = candidate.max ?? Number.POSITIVE_INFINITY
      return rawScore >= min && rawScore <= max
    })

    computed.push({
      measureId: baremo.sourceMeasureId,
      label: sourceMeasure.label,
      subtestId: sourceMeasure.subtestId,
      rawScore,
      scaledScore: band?.scaledValue ?? null,
      percentile: band?.percentile ?? null,
      classification: band?.classification || null,
      computable: Boolean(band),
      reason: band ? null : 'La puntuación registrada no cae en ningún tramo del baremo confirmado.',
    })
  }

  // Medidas con valor capturado que ningún baremo confirmado resuelve: se
  // muestran tal como se registraron, sin marcarlas calculadas.
  const otherMeasures: ComputedMeasure[] = []
  for (const measure of blueprint.measures) {
    if (resolvedMeasureIds.has(measure.id)) continue
    const raw = entry.scores[measure.id]?.value
    if (!raw?.trim()) continue
    otherMeasures.push({
      measureId: measure.id,
      label: measure.label,
      subtestId: measure.subtestId,
      rawScore: parseNumber(raw),
      scaledScore: null,
      percentile: null,
      classification: null,
      computable: false,
      reason: 'Sin baremo confirmado para esta medida.',
    })
  }

  const subscales = computed.filter((item) => item.subtestId !== null)
  const globals = computed.filter((item) => item.subtestId === null)
  const overall = globals.find((item) => item.computable) ?? globals[0] ?? null
  const indices = globals.filter((item) => item !== overall)

  return {
    engineVersion: 'deterministic-v1',
    computedAt: new Date().toISOString(),
    overall,
    subscales,
    indices,
    otherMeasures,
  }
}
