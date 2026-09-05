import type { InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'
import type { InstrumentVisualization } from '@/lib/instruments/instrument-visualizations'

/**
 * Cobertura de respuestas frente a lo esperado. `expected` es `null` cuando el
 * instrumento no declara un total de reactivos esperado (la mayoría de los
 * instrumentos importados no lo hacen hoy) — en ese caso `pct` también es
 * `null`: no hay con qué comparar, así que no se inventa un porcentaje.
 */
export type ResponseCoverage = {
  detected: number
  expected: number | null
  pct: number | null
}

export type InstrumentAnalytics = {
  id: string
  name: string
  status: InstrumentResultBundle['status']
  statusLabel: string
  applicability: InstrumentResultBundle['applicability']
  applicabilityLabel: string
  materials: string[]
  sourceCount: number
  /** Medidas crudas, tal como las produce el agregador — la fuente de las tablas de Step 7 y del informe. */
  results: InstrumentResultBundle['results']
  resultCount: number
  /** Confianza media de extracción (0-100), o `null` si ningún resultado la trae. */
  averageConfidencePct: number | null
  responseCoverage: ResponseCoverage
  charts: InstrumentVisualization[]
  limitations: string[]
  interpretationSummary: string
  interpretationFindings: string[]
  /** Nombres de los archivos aceptados que sostienen los resultados de este instrumento. */
  evidence: string[]
}

export type EvaluationAnalyticsSummary = {
  instrumentCount: number
  packageCount: number
  processedFiles: number
  detectedResponses: number
  /** Respuestas con `status: 'EXTRACTED'` — descarta ambiguas/inválidas/faltantes. */
  validResponses: number
  resultCount: number
  instrumentsWithResults: number
  normativeInstrumentCount: number
  descriptiveInstrumentCount: number
  rawInstrumentCount: number
  noResultInstrumentCount: number
  applicableInstrumentCount: number
  nonApplicableInstrumentCount: number
  unknownApplicabilityCount: number
  chartableInstrumentCount: number
  /**
   * Cobertura agregada (detectado/esperado) entre los instrumentos que sí
   * declaran un total esperado. `null` cuando ninguno lo declara — no se
   * promedia un porcentaje sobre datos que no existen.
   */
  coveragePct: number | null
  evidenceCoveragePct: number | null
  averageConfidencePct: number | null
  dataQualityPct: number | null
  limitationCount: number
}

export type EvaluationAnalytics = {
  summary: EvaluationAnalyticsSummary
  instruments: InstrumentAnalytics[]
  areaDistribution: InstrumentVisualization | null
  overviewCharts: InstrumentVisualization[]
  limitations: string[]
}
