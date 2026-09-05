import { getInstrument } from '@/instruments/catalog'
import type { Instrument } from '@/instruments/types'
import type {
  BlueprintMeasure,
  EvaluationInstrument,
  InstrumentBlueprint,
  ScoreFieldKind,
} from '@/lib/evaluations/model'

/**
 * Qué campos pide un instrumento al registrar resultados.
 *
 * El formulario no lo decide esta aplicación: lo decide el instrumento. Las
 * medidas salen del blueprint validado o de la estructura que el propio
 * instrumento declara (sus subtests y su modo de puntuación). Cuando no hay ni
 * una cosa ni la otra, el resultado es una lista vacía y la pantalla lo dice,
 * en lugar de ofrecer casillas genéricas que invitan a inventarse un dato.
 */

export type ScoreField = BlueprintMeasure & {
  /** Nombre del subtest al que pertenece, cuando pertenece a alguno. */
  subtestLabel: string | null
}

function fieldsFromBlueprint(blueprint: InstrumentBlueprint, entry: EvaluationInstrument): ScoreField[] {
  return blueprint.measures.map((measure) => ({
    ...measure,
    subtestLabel: measure.subtestId
      ? (entry.subtestRuns.find((run) => run.subtestId === measure.subtestId)?.label ?? null)
      : null,
  }))
}

/**
 * Medidas implícitas en la estructura de un instrumento del catálogo: una
 * puntuación directa por subtest y, cuando el instrumento convierte a
 * puntuación típica, también la transformada. No se añade nada más.
 */
function fieldsFromInstrument(instrument: Instrument): ScoreField[] {
  const fields: ScoreField[] = []

  for (const subtest of instrument.subtests) {
    fields.push({
      id: `${subtest.id}.pd`,
      label: 'Puntuación directa',
      kind: 'DIRECT',
      subtestId: subtest.id,
      subtestLabel: subtest.nombre,
      unit: `sobre ${subtest.puntajeMaximo}`,
      source: 'BLUEPRINT',
    })

    if (instrument.scoringMode === 'pd_pt') {
      fields.push({
        id: `${subtest.id}.pt`,
        label: 'Puntuación transformada',
        kind: 'TRANSFORMED',
        subtestId: subtest.id,
        subtestLabel: subtest.nombre,
        // Sin tablas normativas la transformada la aporta el profesional desde
        // su fuente; la aplicación no la calcula ni la sugiere.
        unit: instrument.hasNormativeTables ? '' : 'desde fuente normativa',
        source: 'BLUEPRINT',
      })
    }
  }

  return fields
}

export function scoreFieldsFor(
  entry: EvaluationInstrument,
  blueprints: Record<string, InstrumentBlueprint>,
): ScoreField[] {
  const blueprint = entry.blueprintId ? blueprints[entry.blueprintId] : null
  if (blueprint && blueprint.measures.length > 0) return fieldsFromBlueprint(blueprint, entry)

  const instrument = getInstrument(entry.instrumentId)
  if (instrument && instrument.subtests.length > 0) return fieldsFromInstrument(instrument)

  return []
}

/** Agrupa los campos por subtest, que es como se registran en el protocolo. */
export function groupFieldsBySubtest(fields: ScoreField[]) {
  const groups = new Map<string, { subtestId: string | null; label: string; fields: ScoreField[] }>()

  for (const field of fields) {
    const key = field.subtestId ?? '__general__'
    const group = groups.get(key) ?? {
      subtestId: field.subtestId,
      label: field.subtestLabel ?? 'Medidas del instrumento',
      fields: [],
    }
    group.fields.push(field)
    groups.set(key, group)
  }

  return [...groups.values()]
}

/**
 * Una medida declarada por el profesional. Es la vía legítima para registrar
 * algo que el documento no traía estructurado; queda marcada como tal para que
 * después se sepa de dónde salió.
 */
export function professionalMeasure(input: {
  label: string
  kind: ScoreFieldKind
  unit?: string
  subtestId?: string | null
}): BlueprintMeasure {
  return {
    id: crypto.randomUUID(),
    label: input.label.trim(),
    kind: input.kind,
    subtestId: input.subtestId ?? null,
    unit: input.unit?.trim() ?? '',
    source: 'PROFESSIONAL',
  }
}

export type ScoreCompleteness = {
  total: number
  recorded: number
  missing: ScoreField[]
}

export function scoreCompleteness(entry: EvaluationInstrument, fields: ScoreField[]): ScoreCompleteness {
  const missing = fields.filter((field) => !entry.scores[field.id]?.value.trim())
  return { total: fields.length, recorded: fields.length - missing.length, missing }
}
