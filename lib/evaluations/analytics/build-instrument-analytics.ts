import type { InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'
import { buildInstrumentVisualizations } from '@/lib/instruments/instrument-visualizations'
import { acceptedFiles, packageFileRoleLabels, type InstrumentPackage } from '@/lib/instruments/import/package-model'
import type { InstrumentAnalytics, ResponseCoverage } from '@/lib/evaluations/analytics/types'

/**
 * Únicas fuentes de estas etiquetas: antes vivían por duplicado dentro de
 * `report.ts` (para el PDF) y se repetían con switches propios en Step 7.
 */
export function statusLabel(status: InstrumentResultBundle['status']): string {
  switch (status) {
    case 'NORMATIVE_READY':
      return 'Resultados normativos disponibles'
    case 'DESCRIPTIVE_READY':
      return 'Resultados descriptivos disponibles'
    case 'RAW_READY':
      return 'Respuestas o resultados crudos disponibles'
    case 'NO_RESULTS':
      return 'Digitalizado sin respuestas puntuables'
  }
}

export function applicabilityLabel(applicability: InstrumentResultBundle['applicability']): string {
  switch (applicability) {
    case 'APPLICABLE':
      return 'Aplicable'
    case 'NOT_APPLICABLE':
      return 'No aplicable normativamente'
    case 'UNKNOWN':
      return 'Requiere validación profesional'
  }
}

export function buildInstrumentAnalytics(
  bundle: InstrumentResultBundle,
  pkg: InstrumentPackage | undefined,
): InstrumentAnalytics {
  const files = pkg ? acceptedFiles(pkg) : []
  const materials = [...new Set(files.map((file) => packageFileRoleLabels[file.role] ?? 'Material'))]

  return {
    id: bundle.instrumentId,
    name: bundle.instrumentIdentity,
    status: bundle.status,
    statusLabel: statusLabel(bundle.status),
    applicability: bundle.applicability,
    applicabilityLabel: applicabilityLabel(bundle.applicability),
    materials,
    sourceCount: Math.max(files.length, bundle.evidence.length),
    results: bundle.results,
    resultCount: bundle.results.length,
    averageConfidencePct: averageConfidence(bundle),
    responseCoverage: buildResponseCoverage(pkg),
    charts: buildInstrumentVisualizations(bundle),
    limitations: bundle.limitations,
    interpretationSummary: bundle.interpretation.summary,
    interpretationFindings: bundle.interpretation.findings,
    evidence: bundle.evidence,
  }
}

export type ChartAreaFallback = { title: string; text: string }

/**
 * Texto único para cuando el área de visualización principal no tiene un
 * gráfico que mostrar — Step 7 y el PDF llaman esta misma función, así que
 * dicen exactamente lo mismo en vez de inventar cada uno su propia frase.
 * Nunca dice "sin resultados" si en realidad hay uno o más registrados: sólo
 * que no alcanzan para un gráfico comparativo.
 */
export function chartAreaFallback(input: {
  hasCharts: boolean
  results: Array<{ label: string; value: string }>
  materials: string[]
  detectedResponses: number
}): ChartAreaFallback | null {
  if (input.hasCharts) return null

  if (input.results.length === 0) {
    const materialsLabel = input.materials.length === 1 ? 'material procesado' : 'materiales procesados'
    const responsesLabel = input.detectedResponses === 1 ? 'respuesta detectada' : 'respuestas detectadas'
    return {
      title: 'Sin resultados puntuables',
      text: `${input.materials.length} ${materialsLabel} · ${input.detectedResponses} ${responsesLabel}.`,
    }
  }

  if (input.results.length === 1) {
    return { title: 'Resultado único registrado', text: `${input.results[0].label}: ${input.results[0].value}.` }
  }

  return {
    title: 'Resultados sin comparación gráfica',
    text: `${input.results.length} resultados registrados, sin datos numéricos suficientes para graficar.`,
  }
}

/**
 * La confianza de extracción ya existe por resultado importado
 * (`ImportedComputedResult.confidence`) — antes se calculaba y se descartaba
 * antes de llegar a la UI. Las entradas registradas a mano no traen
 * confianza: no cuentan para el promedio, no se les inventa un valor.
 */
function averageConfidence(bundle: InstrumentResultBundle): number | null {
  const values = bundle.results
    .map((result) => result.confidence)
    .filter((value): value is number => typeof value === 'number')
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
}

/**
 * Cobertura real de respuestas frente a lo esperado, cuando el instrumento lo
 * declara (`ExtractedResponseSet.totalItemsExpected`). La mayoría de los
 * instrumentos importados no lo declaran hoy — en ese caso no se calcula un
 * porcentaje: `expected`/`pct` quedan en `null` y la UI debe mostrar "—".
 */
function buildResponseCoverage(pkg: InstrumentPackage | undefined): ResponseCoverage {
  const sets = pkg?.extractedResponses ?? []
  if (sets.length === 0) return { detected: 0, expected: null, pct: null }

  const detected = sets.reduce((sum, set) => sum + set.totalItemsExtracted, 0)
  const expectedValues = sets.map((set) => set.totalItemsExpected).filter((value): value is number => value !== null)
  const expected = expectedValues.length ? expectedValues.reduce((sum, value) => sum + value, 0) : null
  const pct = expected && expected > 0 ? Math.round((detected / expected) * 100) : null

  return { detected, expected, pct }
}
