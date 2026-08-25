import { getInstrument } from '@/instruments/catalog'
import type { Instrument } from '@/instruments/types'
import { classifyABC, classifyProCalculoPT } from '@/lib/evaluation-engine'
import type { Evaluation } from '@/lib/evaluations/model'

/**
 * Lectura cuantitativa de lo registrado.
 *
 * Aquí no se interpreta nada: se suman puntuaciones y se aplican los baremos
 * publicados. La interpretación es un texto que escribe el profesional y que
 * el sistema nunca rellena por su cuenta.
 */

export type ResultRow = {
  subtestId: string
  numero: number
  nombre: string
  area: string
  pd: number | null
  pt: number | null
  max: number
  /** Sólo cuando el baremo del instrumento lo respalda. */
  classification: string | null
  observations: string
}

export type InstrumentResult = {
  instrument: Instrument
  rows: ResultRow[]
  recorded: number
  total: number
  /** Suma de puntuaciones directas registradas. */
  pdTotal: number
  /** Rango y nivel globales, sólo cuando el instrumento define baremo total. */
  global: { range: string; level: string } | null
  /** Lo que falta para que el resultado sea completo. */
  notices: string[]
}

function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function instrumentResult(evaluation: Evaluation, instrumentId: string): InstrumentResult | null {
  const instrument = getInstrument(instrumentId)
  const application = evaluation.instrumentApplications[instrumentId]
  if (!instrument || !application) return null

  const rows: ResultRow[] = instrument.subtests.map((subtest) => {
    const entry = application.entries[subtest.id]
    const pd = entry ? toNumber(entry.pd) : null
    const pt = entry ? toNumber(entry.pt) : null

    let classification: string | null = null
    if (instrument.scoringMode === 'pd_pt') {
      classification = pt === null ? null : classifyProCalculoPT(pt)
    }

    return {
      subtestId: subtest.id,
      numero: subtest.numero,
      nombre: subtest.nombre,
      area: subtest.area,
      pd,
      pt,
      max: subtest.puntajeMaximo,
      classification,
      observations: entry?.observations ?? '',
    }
  })

  const recorded = rows.filter((row) => row.pd !== null).length
  const pdTotal = rows.reduce((sum, row) => sum + (row.pd ?? 0), 0)
  const complete = recorded === rows.length

  // El baremo total del Test ABC se aplica sobre los ocho subtests. Aplicarlo
  // con subtests sin registrar daría un rango falsamente bajo.
  const global = instrument.scoringMode === 'manual_score' && complete ? classifyABC(pdTotal) : null

  const notices: string[] = []
  if (!complete) {
    notices.push(
      `Faltan ${rows.length - recorded} de ${rows.length} ${instrument.unidad.plural} por registrar; el resultado global no se calcula hasta completarlos.`,
    )
  }
  if (instrument.scoringMode === 'pd_pt' && !instrument.hasNormativeTables) {
    const withoutPt = rows.filter((row) => row.pd !== null && row.pt === null).length
    notices.push(instrument.normativeStatus)
    if (withoutPt > 0) {
      notices.push(`${withoutPt} ${withoutPt === 1 ? 'subárea' : 'subáreas'} sin PT: su clasificación queda pendiente.`)
    }
  }
  if (instrument.scoringMode === 'manual_score') {
    notices.push(instrument.normativeStatus)
  }

  return { instrument, rows, recorded, total: rows.length, pdTotal, global, notices }
}

export function evaluationResults(evaluation: Evaluation): InstrumentResult[] {
  return Object.keys(evaluation.instrumentApplications)
    .map((id) => instrumentResult(evaluation, id))
    .filter((result): result is InstrumentResult => result !== null)
}

export type ProfileBand = 'low' | 'mid' | 'high'

export type ProfilePoint = {
  label: string
  /** Proporción 0..1 sólo para dibujar; el dato real va en `caption`. */
  ratio: number
  caption: string
  band: ProfileBand
}

export type InstrumentProfile = {
  points: ProfilePoint[]
  /** Qué mide la barra, dicho debajo del gráfico. */
  scaleCaption: string
  /** Reparto por banda: es lo que se lee de un vistazo. */
  distribution: { band: ProfileBand; label: string; count: number }[]
  /** Mediciones dejadas fuera por no tener escala comparable. */
  omitted: number
}

const bandLabels: Record<ProfileBand, string> = {
  low: 'Desempeño bajo',
  mid: 'Desempeño medio',
  high: 'Desempeño alto',
}

function distributionOf(points: ProfilePoint[]) {
  return (['low', 'mid', 'high'] as const).map((band) => ({
    band,
    label: bandLabels[band],
    count: points.filter((point) => point.band === band).length,
  }))
}

/**
 * Perfil de un instrumento, en su propia escala.
 *
 * Un gráfico por instrumento y no uno común: la puntuación del Test ABC va de
 * 0 a 3 y la puntuación típica de PRO-CÁLCULO se mueve alrededor de 50. Puestas
 * en la misma barra, un 1 sobre 3 y una PT de 38 parecían lo mismo sin serlo,
 * y esa comparación no significa nada.
 */
export function instrumentProfile(result: InstrumentResult): InstrumentProfile {
  if (result.instrument.scoringMode === 'manual_score') {
    const scored = result.rows.filter((row) => row.pd !== null && row.max > 0)
    const points: ProfilePoint[] = scored.map((row) => {
      const ratio = (row.pd as number) / row.max
      return {
        label: row.area,
        ratio,
        caption: `${row.pd} de ${row.max}`,
        band: ratio <= 1 / 3 ? 'low' : ratio <= 2 / 3 ? 'mid' : 'high',
      }
    })
    points.sort((a, b) => a.ratio - b.ratio)
    return {
      points,
      scaleCaption: `Puntuación directa de cada ${result.instrument.unidad.singular.toLowerCase()}, sobre su máximo.`,
      distribution: distributionOf(points),
      omitted: result.rows.length - scored.length,
    }
  }

  // Sin PT no hay escala comparable: la PD suelta no dice si el desempeño es
  // bajo, y dibujarla igualmente sería inventarse un baremo.
  const withPt = result.rows.filter((row) => row.pt !== null)
  const points: ProfilePoint[] = withPt.map((row) => {
    const pt = row.pt as number
    return {
      label: row.nombre,
      // La escala típica se encuadra entre 20 y 80, que es donde cae el rango
      // normal publicado (40 a 60); así el centro de la barra es lo esperable.
      ratio: Math.max(0, Math.min(1, (pt - 20) / 60)),
      caption: `PT ${pt}`,
      band: pt <= 39 ? 'low' : pt <= 60 ? 'mid' : 'high',
    }
  })
  points.sort((a, b) => a.ratio - b.ratio)

  return {
    points,
    scaleCaption: 'Puntuación típica sobre una escala de 20 a 80; el rango normal publicado va de 40 a 60.',
    distribution: distributionOf(points),
    omitted: result.rows.length - withPt.length,
  }
}
