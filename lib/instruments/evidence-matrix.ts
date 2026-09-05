import { getInstrument } from '@/instruments/catalog'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import type {
  Evaluation,
  EvaluationInstrument,
  FunctionalAreaId,
  InstrumentBlueprint,
} from '@/lib/evaluations/model'
import { instrumentProfileChart } from '@/lib/instruments/charts'
import { sessionTiming } from '@/lib/instruments/session-timing'

/**
 * Matriz general de evidencia.
 *
 * Cruza lo observado en las áreas funcionales con lo medido por los
 * instrumentos, área por área, para que se vea de una vez qué sostiene cada
 * hallazgo y con cuántas fuentes. Es la pieza que convierte una pila de
 * resultados sueltos en evidencia que se puede defender.
 *
 * No concluye nada. Dice qué dice cada fuente, cuántas coinciden y cuáles no;
 * la lectura la hace el profesional. En particular, dos fuentes que apuntan a lo
 * contrario no se promedian ni se descartan: se marcan como discrepancia, que es
 * justo el dato que interesa.
 */

export type EvidenceDirection = 'difficulty' | 'developing' | 'adequate' | 'unknown'

export const evidenceDirectionLabels: Record<EvidenceDirection, string> = {
  difficulty: 'Dificultad',
  developing: 'En desarrollo',
  adequate: 'Adecuado',
  unknown: 'Sin determinar',
}

export type EvidenceLevel = 'INSTRUMENTAL_APPROVED' | 'INSTRUMENTAL' | 'OBSERVATIONAL' | 'INSUFFICIENT'

export const evidenceLevelLabels: Record<EvidenceLevel, string> = {
  INSTRUMENTAL_APPROVED: 'Instrumental validada',
  INSTRUMENTAL: 'Instrumental registrada',
  OBSERVATIONAL: 'Observacional',
  INSUFFICIENT: 'Información insuficiente',
}

export type ConvergenceState = 'CONVERGENT' | 'DIVERGENT' | 'SINGLE_SOURCE' | 'NONE'

export const convergenceLabels: Record<ConvergenceState, string> = {
  CONVERGENT: 'Convergente',
  DIVERGENT: 'Discrepancia',
  SINGLE_SOURCE: 'Fuente única',
  NONE: 'Sin evidencia',
}

export type EvidenceSource = {
  id: string
  /** Nombre de la fuente tal como se cita: «Áreas evaluadas», el instrumento… */
  label: string
  kind: 'AREA' | 'INSTRUMENT' | 'OBSERVATION'
  finding: string
  direction: EvidenceDirection
  level: EvidenceLevel
  /** Referencia para poder abrir el respaldo: entrada de batería, área o registro. */
  reference: { evaluationInstrumentId?: string; areaId?: string; at?: string }
}

export type EvidenceRow = {
  areaId: string
  area: string
  sources: EvidenceSource[]
  direction: EvidenceDirection
  /**
   * Hallazgo de la fila tal como debe leerse. Cuando las fuentes no coinciden
   * no se elige una: se dice que discrepan, porque presentar la dirección de la
   * primera fuente daría por resuelto justo lo que está en disputa.
   */
  summary: string
  level: EvidenceLevel
  convergence: ConvergenceState
  observations: string
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

/**
 * Un instrumento cubre un área cuando el profesional lo ha vinculado a ella o
 * cuando el propio instrumento declara explorarla.
 *
 * La vinculación explícita manda. Un instrumento incorporado desde un documento
 * no trae áreas escritas en ninguna parte, y sin esta vía sus resultados nunca
 * llegarían a la matriz: cuanto mejor funciona la incorporación, más vacía
 * quedaría la evidencia.
 */
function coversArea(entry: EvaluationInstrument, areaId: FunctionalAreaId, areaLabel: string) {
  if (entry.linkedAreas.includes(areaId)) return true

  const instrument = getInstrument(entry.instrumentId)
  if (!instrument) return false

  const target = normalize(areaLabel)
  return instrument.areas.some((area) => {
    const candidate = normalize(area)
    return candidate.includes(target) || target.includes(candidate)
  })
}

function directionFromPerformance(performance: string): EvidenceDirection {
  if (performance === 'Dificultad marcada') return 'difficulty'
  if (performance === 'En desarrollo') return 'developing'
  if (performance === 'Adecuado') return 'adequate'
  return 'unknown'
}

/**
 * Dirección que sugiere un instrumento en un área: el reparto de sus medidas por
 * banda. Mayoría en la banda baja apunta a dificultad; mayoría alta, a
 * desempeño adecuado. Sin medidas registradas no apunta a nada.
 */
function directionFromInstrument(
  entry: EvaluationInstrument,
  blueprints: Record<string, InstrumentBlueprint>,
): { direction: EvidenceDirection; finding: string } {
  const chart = instrumentProfileChart(entry, blueprints)
  if (chart.rows.length === 0) {
    return { direction: 'unknown', finding: 'Sin medidas registradas con escala declarada.' }
  }

  const low = chart.rows.filter((row) => row.band === 'low').length
  const high = chart.rows.filter((row) => row.band === 'high').length
  const total = chart.rows.length

  const finding = `${total} ${total === 1 ? 'medida registrada' : 'medidas registradas'}: ${low} en banda baja, ${total - low - high} media, ${high} alta.`

  if (low > total / 2) return { direction: 'difficulty', finding }
  if (high > total / 2) return { direction: 'adequate', finding }
  return { direction: 'developing', finding }
}

function levelFor(entry: EvaluationInstrument): EvidenceLevel {
  return entry.report.status === 'APPROVED' ? 'INSTRUMENTAL_APPROVED' : 'INSTRUMENTAL'
}

/** El nivel de evidencia de una fila es el de su fuente más sólida. */
const levelRank: Record<EvidenceLevel, number> = {
  INSTRUMENTAL_APPROVED: 3,
  INSTRUMENTAL: 2,
  OBSERVATIONAL: 1,
  INSUFFICIENT: 0,
}

function convergenceOf(sources: EvidenceSource[]): ConvergenceState {
  const known = sources.filter((source) => source.direction !== 'unknown')
  if (known.length === 0) return 'NONE'
  if (known.length === 1) return 'SINGLE_SOURCE'

  const directions = new Set(known.map((source) => source.direction))
  if (directions.size === 1) return 'CONVERGENT'

  // «En desarrollo» junto a «dificultad» o «adecuado» es un matiz, no una
  // contradicción: sólo los dos extremos opuestos cuentan como discrepancia.
  const hasDifficulty = directions.has('difficulty')
  const hasAdequate = directions.has('adequate')
  return hasDifficulty && hasAdequate ? 'DIVERGENT' : 'CONVERGENT'
}

export function buildEvidenceMatrix(
  evaluation: Evaluation,
  blueprints: Record<string, InstrumentBlueprint>,
): EvidenceRow[] {
  const completed = evaluation.battery.filter((entry) => sessionTiming(entry.events).status === 'COMPLETED')

  return functionalAreaSchema.map((schema) => {
    const record = evaluation.functionalAreas[schema.id]
    const sources: EvidenceSource[] = []

    if (record && record.performance !== '') {
      sources.push({
        id: `area-${schema.id}`,
        label: 'Áreas evaluadas',
        kind: 'AREA',
        finding: record.description.trim() || record.performance,
        direction: directionFromPerformance(record.performance),
        level: 'OBSERVATIONAL',
        reference: { areaId: schema.id },
      })
    }

    for (const entry of completed) {
      if (!coversArea(entry, schema.id, schema.label)) continue
      const { direction, finding } = directionFromInstrument(entry, blueprints)
      sources.push({
        id: `instrument-${entry.id}`,
        label: entry.name,
        kind: 'INSTRUMENT',
        finding: entry.conclusion.status === 'APPROVED' && entry.conclusion.text.trim() ? entry.conclusion.text : finding,
        direction,
        level: levelFor(entry),
        reference: { evaluationInstrumentId: entry.id },
      })
    }

    const known = sources.filter((source) => source.direction !== 'unknown')
    const level = sources.reduce<EvidenceLevel>(
      (best, source) => (levelRank[source.level] > levelRank[best] ? source.level : best),
      'INSUFFICIENT',
    )
    const convergence = convergenceOf(sources)
    const direction = known[0]?.direction ?? 'unknown'

    return {
      areaId: schema.id,
      area: schema.label,
      sources,
      direction,
      summary:
        convergence === 'DIVERGENT'
          ? `Fuentes discrepantes: ${known.map((source) => evidenceDirectionLabels[source.direction].toLowerCase()).join(' / ')}`
          : evidenceDirectionLabels[direction],
      level: sources.length === 0 ? 'INSUFFICIENT' : level,
      convergence,
      observations: record?.observations?.trim() ?? '',
    }
  })
}

export type EvidenceHighlights = {
  convergences: EvidenceRow[]
  discrepancies: EvidenceRow[]
  strengths: EvidenceRow[]
  difficulties: EvidenceRow[]
  insufficient: EvidenceRow[]
}

/** Lo que la matriz deja ver de un vistazo. Recuento, no interpretación. */
export function evidenceHighlights(rows: EvidenceRow[]): EvidenceHighlights {
  return {
    convergences: rows.filter((row) => row.convergence === 'CONVERGENT'),
    discrepancies: rows.filter((row) => row.convergence === 'DIVERGENT'),
    strengths: rows.filter((row) => row.direction === 'adequate' && row.convergence !== 'NONE'),
    difficulties: rows.filter((row) => row.direction === 'difficulty' && row.convergence !== 'NONE'),
    insufficient: rows.filter((row) => row.level === 'INSUFFICIENT'),
  }
}
