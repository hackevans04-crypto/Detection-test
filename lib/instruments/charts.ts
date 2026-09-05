import { getInstrument } from '@/instruments/catalog'
import type { Baremo } from '@/instruments/types'
import type { EvaluationInstrument, InstrumentBlueprint } from '@/lib/evaluations/model'
import { classifyWithBaremos } from '@/lib/instruments/baremo'
import { scoreFieldsFor, type ScoreField } from '@/lib/instruments/score-schema'
import { sessionTiming } from '@/lib/instruments/session-timing'

/**
 * Tramo de baremo confirmado que cubre una puntuación, para un instrumento
 * incorporado por Detection AI (`InstrumentBlueprint.baremos`) — a diferencia
 * de `bandFor`/`normativeReference`, que sólo resuelven instrumentos del
 * catálogo heredado (`instruments/catalog.ts`). Sin esto, el perfil de un
 * instrumento incorporado por paquete nunca tendría zona de referencia ni
 * clasificación, porque su `instrumentId` es el id del paquete, no uno del
 * catálogo.
 *
 * No se infiere si el tramo es «alto» o «bajo»: el profesional ya escribió la
 * clasificación al transcribir el baremo, y usarla tal cual evita suponer que
 * una puntuación más alta es mejor cuando el instrumento podría medir lo
 * contrario (síntomas, por ejemplo).
 */
function baremoBandFor(
  blueprint: InstrumentBlueprint | undefined,
  measureId: string,
  value: number,
): { classification: string; scaledValue: number | null; percentile: number | null; min: number; max: number } | null {
  const baremo = blueprint?.baremos.find((item) => item.sourceMeasureId === measureId && item.confirmedAt)
  if (!baremo || baremo.bands.length === 0) return null

  const band = baremo.bands.find((candidate) => {
    const min = candidate.min ?? Number.NEGATIVE_INFINITY
    const max = candidate.max ?? Number.POSITIVE_INFINITY
    return value >= min && value <= max
  })
  if (!band) return null

  const bounded = baremo.bands.filter(
    (item): item is typeof item & { min: number; max: number } => item.min !== null && item.max !== null,
  )
  const overallMin = bounded.length > 0 ? Math.min(...bounded.map((item) => item.min)) : 0
  const overallMax = bounded.length > 0 ? Math.max(...bounded.map((item) => item.max)) : value

  return {
    classification: band.classification || 'Sin clasificar',
    scaledValue: band.scaledValue,
    percentile: band.percentile,
    min: overallMin,
    max: overallMax,
  }
}

/**
 * Series para los gráficos de resultados.
 *
 * Aquí no se calcula psicometría: se ordena lo que ya está registrado para poder
 * dibujarlo. Una medida sin registrar no se estima ni se interpola; sale de la
 * serie y se cuenta aparte, porque un hueco en un perfil es información y
 * rellenarlo sería inventar el dato que falta.
 *
 * La barra se dibuja siempre contra una escala declarada por el instrumento -su
 * máximo, o el rango de su baremo-. Sin escala declarada no hay barra: una
 * puntuación directa suelta no dice si es alta o baja, y dibujarla con un máximo
 * supuesto es fabricar un baremo con forma de gráfico.
 */

export type ProfileBand = 'low' | 'mid' | 'high' | 'unknown'

export const profileBandLabels: Record<ProfileBand, string> = {
  low: 'Bajo',
  mid: 'Medio',
  high: 'Alto',
  unknown: 'Sin clasificar',
}

export type ProfileRow = {
  id: string
  label: string
  /** Grupo al que pertenece la medida: subtest, escala o el instrumento entero. */
  group: string | null
  value: number
  /** 0..1 sólo para dibujar. El dato real va en `caption`. */
  ratio: number
  caption: string
  band: ProfileBand
  bandLabel: string
  /** Sólo cuando un baremo confirmado lo declara para esta medida. */
  percentile: number | null
}

export type NormativeReference = {
  min: number
  max: number
  label: string
}

export type InstrumentProfileChart = {
  rows: ProfileRow[]
  /** Qué mide el eje, dicho debajo del gráfico. */
  scaleCaption: string
  /** Zona esperada, cuando el baremo del instrumento la declara. */
  reference: NormativeReference | null
  /** Medidas sin registrar: quedan fuera del dibujo y se declaran. */
  missing: number
  /** Medidas registradas que no tienen escala comparable declarada. */
  withoutScale: number
}

function toNumber(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** `sobre 3` → 3. La escala de un campo viene declarada en su unidad. */
function maxFromUnit(unit: string): number | null {
  const match = /sobre\s+([\d.,]+)/i.exec(unit)
  return match ? toNumber(match[1]) : null
}

/**
 * Rango normativo total del instrumento: el tramo que su baremo describe como
 * esperable. Se usa como zona de referencia detrás de las barras.
 */
export function normativeReference(instrumentId: string): NormativeReference | null {
  const instrument = getInstrument(instrumentId)
  if (!instrument) return null

  const bounded = instrument.baremos.filter(
    (baremo): baremo is Baremo & { min: number; max: number } =>
      typeof baremo.min === 'number' && typeof baremo.max === 'number',
  )
  if (bounded.length === 0) return null

  // El tramo intermedio del baremo es el «esperado»: ni el extremo bajo abierto
  // ni el alto abierto, que son precisamente los que no tienen ambos límites.
  const middle = bounded[Math.floor(bounded.length / 2)]
  return { min: middle.min, max: middle.max, label: `${middle.rango} · ${middle.descripcion}` }
}

function bandFor(instrumentId: string, value: number): { band: ProfileBand; label: string } {
  const instrument = getInstrument(instrumentId)
  const baremo = instrument ? classifyWithBaremos(instrument.baremos, value) : null
  if (!baremo) return { band: 'unknown', label: profileBandLabels.unknown }

  const index = instrument!.baremos.indexOf(baremo)
  const position = index / Math.max(1, instrument!.baremos.length - 1)
  // Los baremos se declaran de mayor a menor: el primero es el tramo alto.
  const band: ProfileBand = position <= 0.33 ? 'high' : position >= 0.67 ? 'low' : 'mid'
  return { band, label: baremo.rango }
}

/**
 * Perfil de un instrumento a partir de sus medidas registradas.
 *
 * Sólo entran los campos con escala declarada -un máximo en la unidad de la
 * medida- porque son los únicos que se pueden poner en una barra sin mentir.
 */
export function instrumentProfileChart(
  entry: EvaluationInstrument,
  blueprints: Record<string, InstrumentBlueprint>,
): InstrumentProfileChart {
  const fields = scoreFieldsFor(entry, blueprints)
  const scorable = fields.filter((field) => field.kind === 'DIRECT' || field.kind === 'TRANSFORMED')
  const blueprint = entry.blueprintId ? blueprints[entry.blueprintId] : undefined

  let missing = 0
  let withoutScale = 0
  const rows: ProfileRow[] = []

  for (const field of scorable) {
    const value = toNumber(entry.scores[field.id]?.value)
    if (value === null) {
      missing += 1
      continue
    }

    // Primero el baremo que el propio blueprint confirmó -el único que existe
    // para un instrumento incorporado por paquete-; el catálogo heredado sólo
    // se consulta si esto no resuelve nada.
    const resolved = baremoBandFor(blueprint, field.id, value)
    if (resolved) {
      const span = resolved.max - resolved.min
      const ratio = span > 0 ? (value - resolved.min) / span : 0.5
      rows.push({
        id: field.id,
        label: field.subtestLabel ?? field.label,
        group: field.subtestLabel,
        value,
        ratio: Math.max(0, Math.min(1, ratio)),
        caption:
          resolved.scaledValue !== null && resolved.scaledValue !== value
            ? `${value} → ${resolved.scaledValue}`
            : `${value}`,
        band: 'unknown',
        bandLabel: resolved.classification,
        percentile: resolved.percentile,
      })
      continue
    }

    const max = scaleMaxFor(field, entry.instrumentId)
    if (max === null || max <= 0) {
      withoutScale += 1
      continue
    }

    const { band, label } = field.kind === 'TRANSFORMED'
      ? bandFor(entry.instrumentId, value)
      : ratioBand(value / max)

    rows.push({
      id: field.id,
      label: field.subtestLabel ?? field.label,
      group: field.subtestLabel,
      value,
      ratio: Math.max(0, Math.min(1, value / max)),
      caption: field.kind === 'TRANSFORMED' ? `${value}` : `${value} de ${max}`,
      band,
      bandLabel: label,
      percentile: null,
    })
  }

  const transformed = scorable.some((field) => field.kind === 'TRANSFORMED')

  return {
    rows,
    scaleCaption: transformed
      ? 'Puntuación transformada sobre la escala declarada por el instrumento.'
      : 'Puntuación directa de cada medida, sobre su máximo declarado.',
    reference: transformed ? normativeReference(entry.instrumentId) : null,
    missing,
    withoutScale,
  }
}

function ratioBand(ratio: number): { band: ProfileBand; label: string } {
  if (ratio <= 1 / 3) return { band: 'low', label: profileBandLabels.low }
  if (ratio <= 2 / 3) return { band: 'mid', label: profileBandLabels.mid }
  return { band: 'high', label: profileBandLabels.high }
}

function scaleMaxFor(field: ScoreField, instrumentId: string): number | null {
  const declared = maxFromUnit(field.unit)
  if (declared !== null) return declared

  if (field.kind === 'TRANSFORMED') {
    const reference = normativeReference(instrumentId)
    // La escala típica se encuadra sobre el doble del techo del tramo esperado,
    // que es el rango que el propio baremo describe. No es una norma inventada:
    // es el eje sobre el que ese baremo ya está expresado.
    if (reference) return reference.max * 1.5
  }

  return null
}

/**
 * Selección de visualización.
 *
 * El perfil de barras (`ProfileChart`) siempre está disponible cuando hay
 * filas representables; radar y percentiles sólo se ofrecen cuando de verdad
 * aportan algo, no como adorno.
 */

/** Un radar con dos ejes es una línea con pasos extra: hacen falta al menos tres. */
export function radarEligible(chart: InstrumentProfileChart): boolean {
  return chart.rows.length >= 3
}

/** Sólo las filas con percentil declarado por un baremo confirmado. */
export function percentileRows(chart: InstrumentProfileChart): ProfileRow[] {
  return chart.rows.filter((row) => row.percentile !== null)
}

/**
 * Reparto por banda. Son tres números, no un gráfico: se muestran como cifras
 * porque una tarta de tres porciones se lee peor que las tres cifras.
 */
export function bandDistribution(rows: ProfileRow[]) {
  return (['low', 'mid', 'high'] as const).map((band) => ({
    band,
    label: profileBandLabels[band],
    count: rows.filter((row) => row.band === band).length,
  }))
}

export type ComparisonPair = {
  instrumentId: string
  name: string
  before: { entry: EvaluationInstrument; at: string }
  after: { entry: EvaluationInstrument; at: string }
}

/**
 * Aplicaciones repetidas del mismo instrumento dentro de la batería, que es lo
 * único que permite una comparación pre/post real. Sin una segunda aplicación
 * no hay comparación, y no se dibuja ninguna.
 */
export function comparisonPairs(battery: EvaluationInstrument[]): ComparisonPair[] {
  const byInstrument = new Map<string, EvaluationInstrument[]>()

  for (const entry of battery) {
    const timing = sessionTiming(entry.events)
    if (timing.status !== 'COMPLETED' || !timing.completedAt) continue
    byInstrument.set(entry.instrumentId, [...(byInstrument.get(entry.instrumentId) ?? []), entry])
  }

  const pairs: ComparisonPair[] = []
  for (const [instrumentId, entries] of byInstrument) {
    if (entries.length < 2) continue
    const sorted = entries.sort((a, b) => {
      const left = sessionTiming(a.events).completedAt ?? ''
      const right = sessionTiming(b.events).completedAt ?? ''
      return left.localeCompare(right)
    })
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    pairs.push({
      instrumentId,
      name: first.name,
      before: { entry: first, at: sessionTiming(first.events).completedAt! },
      after: { entry: last, at: sessionTiming(last.events).completedAt! },
    })
  }

  return pairs
}
