import type { Evaluation } from '@/lib/evaluations/model'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import type { InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'

export type InstrumentVisualizationPoint = {
  label: string
  value: number
  caption: string
  source: string
  classification?: string
}

export type InstrumentVisualization = {
  id: string
  type: 'bar' | 'percentile' | 'donut' | 'flow' | 'gauge' | 'matrix' | 'stacked'
  title: string
  unit: string
  source: string
  maxValue: number
  values: InstrumentVisualizationPoint[]
  insight?: string
}

type VisualizableResult = InstrumentResultBundle['results'][number]

export function buildInstrumentVisualizations(bundle: InstrumentResultBundle): InstrumentVisualization[] {
  const points = bundle.results.map(toPoint).filter((point): point is InstrumentVisualizationPoint => point !== null)
  if (points.length < 2) return []

  const percentiles = points.filter((point) => point.caption.toUpperCase().startsWith('P') || point.value <= 100)
  const source = firstSource(points)

  if (percentiles.length >= 2 && bundle.results.some((result) => result.percentile !== null && result.percentile !== undefined)) {
    return [
      {
        id: `${bundle.instrumentId}-percentiles`,
        type: 'percentile',
        title: `${bundle.instrumentIdentity} - perfil percentilar`,
        unit: 'Percentil',
        source,
        maxValue: 100,
        values: percentiles.slice(0, 16),
      },
    ]
  }

  return [
    {
      id: `${bundle.instrumentId}-quantitative`,
      type: 'bar',
      title: `${bundle.instrumentIdentity} - resultados cuantitativos`,
      unit: 'Valor registrado',
      source,
      maxValue: Math.max(...points.map((point) => point.value), 1),
      values: points.slice(0, 16),
    },
  ]
}

export function buildAreaDistributionVisualization(evaluation: Evaluation): InstrumentVisualization | null {
  const labels: Record<string, string> = {
    fortaleza: 'Fortaleza',
    adecuado: 'Adecuado',
    desarrollo: 'En desarrollo',
    dificultad: 'Dificultad',
    sin_informacion: 'Sin información',
  }

  const counts = new Map<string, number>()
  for (const area of functionalAreaSchema) {
    const value = normalizePerformance(evaluation.functionalAreas[area.id]?.performance)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  const values = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({
      label: labels[key] ?? key,
      value: count,
      caption: String(count),
      source: 'Áreas funcionales registradas',
    }))

  if (values.length < 2) return null

  return {
    id: 'areas-distribution',
    type: 'donut',
    title: 'Distribución descriptiva de áreas observadas',
    unit: 'Áreas',
    source: 'Detection-test a partir del paso 5',
    maxValue: values.reduce((sum, item) => sum + item.value, 0),
    values,
  }
}

function toPoint(result: VisualizableResult): InstrumentVisualizationPoint | null {
  const numeric =
    typeof result.percentile === 'number'
      ? result.percentile
      : typeof result.numericValue === 'number'
        ? result.numericValue
        : parseNumeric(result.value)
  if (numeric === null) return null
  return {
    label: result.label,
    value: numeric,
    caption: result.percentile !== null && result.percentile !== undefined ? `P${result.percentile}` : result.value,
    source: result.source,
    classification: result.classification ?? undefined,
  }
}

function parseNumeric(value: string) {
  const clean = value.trim().replace(/^P/i, '').replace(',', '.')
  if (!clean) return null
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : null
}

function firstSource(points: InstrumentVisualizationPoint[]) {
  return points.find((point) => point.source.trim())?.source ?? 'Instrumentos IA'
}

function normalizePerformance(value?: string) {
  const text = (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (!text) return 'sin_informacion'
  if (text.includes('fortaleza')) return 'fortaleza'
  if (text.includes('adecu')) return 'adecuado'
  if (text.includes('desarrollo')) return 'desarrollo'
  if (text.includes('dificult') || text.includes('riesgo') || text.includes('bajo')) return 'dificultad'
  return 'sin_informacion'
}
