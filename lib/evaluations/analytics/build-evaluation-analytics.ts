import type { Evaluation } from '@/lib/evaluations/model'
import { buildInstrumentResultBundles } from '@/lib/instruments/evaluation-results-aggregator'
import { buildAreaDistributionVisualization } from '@/lib/instruments/instrument-visualizations'
import { acceptedFiles, type InstrumentPackage } from '@/lib/instruments/import/package-model'
import { buildInstrumentAnalytics } from '@/lib/evaluations/analytics/build-instrument-analytics'
import type { EvaluationAnalytics } from '@/lib/evaluations/analytics/types'
import type { InstrumentVisualization, InstrumentVisualizationPoint } from '@/lib/instruments/instrument-visualizations'

export function findPackageForInstrument(packages: InstrumentPackage[], instrumentId: string) {
  return packages.find((pkg) => pkg.id === instrumentId || pkg.blueprintId === instrumentId)
}

/**
 * Fuente única de los números y gráficos de instrumentos: antes Step 7 (los
 * diagnósticos de `step6-completion.ts`), el panel de resultados importados y
 * el informe (`getReportInstrumentSummary`) calculaban por separado versiones
 * ligeramente distintas de las mismas cifras a partir de
 * `buildInstrumentResultBundles`. Esta función corre el agregador una sola
 * vez y expone lo mismo para los tres consumidores.
 */
export function buildEvaluationAnalytics(evaluation: Evaluation): EvaluationAnalytics {
  const packages = evaluation.instrumentPackages ?? []
  const bundles = buildInstrumentResultBundles(evaluation)
  const instruments = bundles.map((bundle) =>
    buildInstrumentAnalytics(bundle, findPackageForInstrument(packages, bundle.instrumentId)),
  )

  const processedFiles = packages.reduce((sum, pkg) => sum + acceptedFiles(pkg).length, 0)
  const detectedResponses = packages.reduce(
    (sum, pkg) => sum + (pkg.extractedResponses ?? []).reduce((setSum, set) => setSum + set.responses.length, 0),
    0,
  )
  const validResponses = packages.reduce(
    (sum, pkg) =>
      sum +
      (pkg.extractedResponses ?? []).reduce(
        (setSum, set) => setSum + set.responses.filter((response) => response.status === 'EXTRACTED').length,
        0,
      ),
    0,
  )
  const confidences = instruments
    .map((instrument) => instrument.averageConfidencePct)
    .filter((value): value is number => value !== null)
  const withKnownCoverage = instruments.filter((instrument) => instrument.responseCoverage.expected !== null)
  const expectedResponses = withKnownCoverage.reduce(
    (sum, instrument) => sum + (instrument.responseCoverage.expected ?? 0),
    0,
  )
  const coveragePct =
    withKnownCoverage.length && expectedResponses > 0
      ? Math.round(
          (withKnownCoverage.reduce((sum, instrument) => sum + instrument.responseCoverage.detected, 0) /
            expectedResponses) *
            100,
        )
      : null
  const limitations = [...new Set(instruments.flatMap((instrument) => instrument.limitations))]
  const instrumentCount = instruments.length
  const instrumentsWithResults = instruments.filter((instrument) => instrument.resultCount > 0).length
  const evidenceCoveragePct = instrumentCount
    ? Math.round((instruments.filter((instrument) => instrument.sourceCount > 0 || instrument.evidence.length > 0).length / instrumentCount) * 100)
    : null
  const averageConfidencePct = confidences.length
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null
  const qualitySignals = [averageConfidencePct, coveragePct].filter((value): value is number => value !== null)
  const dataQualityPct = qualitySignals.length
    ? Math.round(qualitySignals.reduce((sum, value) => sum + value, 0) / qualitySignals.length)
    : null
  const summary = {
    instrumentCount,
    packageCount: packages.length,
    processedFiles,
    detectedResponses,
    validResponses,
    resultCount: instruments.reduce((sum, instrument) => sum + instrument.resultCount, 0),
    instrumentsWithResults,
    normativeInstrumentCount: instruments.filter((instrument) => instrument.status === 'NORMATIVE_READY').length,
    descriptiveInstrumentCount: instruments.filter((instrument) => instrument.status === 'DESCRIPTIVE_READY').length,
    rawInstrumentCount: instruments.filter((instrument) => instrument.status === 'RAW_READY').length,
    noResultInstrumentCount: instruments.filter((instrument) => instrument.status === 'NO_RESULTS').length,
    applicableInstrumentCount: instruments.filter((instrument) => instrument.applicability === 'APPLICABLE').length,
    nonApplicableInstrumentCount: instruments.filter((instrument) => instrument.applicability === 'NOT_APPLICABLE').length,
    unknownApplicabilityCount: instruments.filter((instrument) => instrument.applicability === 'UNKNOWN').length,
    chartableInstrumentCount: instruments.filter((instrument) => instrument.charts.length > 0).length,
    coveragePct,
    evidenceCoveragePct,
    averageConfidencePct,
    dataQualityPct,
    limitationCount: limitations.length,
  }

  return {
    summary,
    instruments,
    areaDistribution: buildAreaDistributionVisualization(evaluation),
    overviewCharts: buildClinicalOverviewCharts(summary),
    limitations,
  }
}

type AnalyticsSummary = EvaluationAnalytics['summary']

function buildClinicalOverviewCharts(summary: AnalyticsSummary): InstrumentVisualization[] {
  const charts: InstrumentVisualization[] = []
  const completionPct = summary.instrumentCount
    ? Math.round((summary.instrumentsWithResults / summary.instrumentCount) * 100)
    : 0
  const readinessSignals = [
    completionPct,
    summary.dataQualityPct,
    summary.coveragePct,
    summary.evidenceCoveragePct,
  ].filter((value): value is number => value !== null)
  const readinessPct = readinessSignals.length
    ? Math.round(readinessSignals.reduce((sum, value) => sum + value, 0) / readinessSignals.length)
    : completionPct

  charts.push({
    id: 'evaluation-readiness-index',
    type: 'gauge',
    title: 'Preparación para interpretación',
    unit: 'Índice clínico',
    source: 'Resultados, cobertura y evidencia aceptada',
    maxValue: 100,
    insight:
      readinessPct >= 80
        ? 'Expediente con base suficiente para lectura profesional.'
        : readinessPct >= 40
          ? 'Expediente con datos parciales; requiere revisión de soporte.'
          : 'Expediente aún sin resultados puntuables suficientes.',
    values: [
      {
        label: 'Preparación',
        value: readinessPct,
        caption: `${readinessPct}%`,
        source: 'Síntesis de resultados, calidad, cobertura y evidencia',
      },
    ],
  })

  const processValues = [
    { label: 'Material recibido', value: summary.processedFiles, caption: String(summary.processedFiles), source: 'Archivos aceptados' },
    { label: 'Paquetes', value: summary.packageCount, caption: String(summary.packageCount), source: 'Instrumentos IA' },
    { label: 'Instrumentos', value: summary.instrumentCount, caption: String(summary.instrumentCount), source: 'Expediente' },
    { label: 'Respuestas válidas', value: summary.validResponses, caption: String(summary.validResponses), source: 'Extracción IA' },
    { label: 'Resultados', value: summary.resultCount, caption: String(summary.resultCount), source: 'Cálculo consolidado' },
  ].filter((point) => point.value > 0 || summary.processedFiles > 0 || summary.instrumentCount > 0)
  if (processValues.length > 0) {
    charts.push({
      id: 'evaluation-processing-trace',
      type: 'flow',
      title: 'Trazabilidad del procesamiento',
      unit: 'Conteo',
      source: 'Expediente e Instrumentos IA',
      maxValue: Math.max(...processValues.map((point) => point.value), 1),
      insight: 'Lectura secuencial desde el material recibido hasta el resultado calculado.',
      values: processValues,
    })
  }

  const matrixValues = [
    { label: 'Instrumentos digitalizados', value: summary.instrumentCount, caption: String(summary.instrumentCount), source: 'Expediente' },
    { label: 'Con resultados', value: summary.instrumentsWithResults, caption: String(summary.instrumentsWithResults), source: 'Instrumentos IA' },
    { label: 'Con gráfico', value: summary.chartableInstrumentCount, caption: String(summary.chartableInstrumentCount), source: 'Resultados cuantitativos' },
    { label: 'Limitaciones', value: summary.limitationCount, caption: String(summary.limitationCount), source: 'Validación profesional' },
  ].filter((point) => point.value > 0 || summary.instrumentCount > 0)
  if (matrixValues.length > 0) {
    charts.push({
      id: 'evaluation-evidence-matrix',
      type: 'matrix',
      title: 'Matriz de evidencia clínica',
      unit: 'Indicadores',
      source: 'Instrumentos IA y registros manuales',
      maxValue: Math.max(...matrixValues.map((point) => point.value), 1),
      insight: 'Cruza disponibilidad de instrumentos, resultados y limitaciones sin duplicar información.',
      values: matrixValues,
    })
  }

  const statusValues = compactPoints([
    { label: 'Normativos', value: summary.normativeInstrumentCount, caption: String(summary.normativeInstrumentCount), source: 'Estado de instrumentos' },
    { label: 'Descriptivos', value: summary.descriptiveInstrumentCount, caption: String(summary.descriptiveInstrumentCount), source: 'Estado de instrumentos' },
    { label: 'Crudos', value: summary.rawInstrumentCount, caption: String(summary.rawInstrumentCount), source: 'Estado de instrumentos' },
    { label: 'Sin resultados', value: summary.noResultInstrumentCount, caption: String(summary.noResultInstrumentCount), source: 'Estado de instrumentos' },
  ])
  if (statusValues.length > 1) {
    charts.push({
      id: 'evaluation-status-distribution',
      type: 'stacked',
      title: 'Distribución de resultados por instrumento',
      unit: 'Instrumentos',
      source: 'Instrumentos IA y registros manuales',
      maxValue: Math.max(summary.instrumentCount, 1),
      insight: 'Separa resultados normativos, descriptivos, crudos y casos sin puntuación.',
      values: statusValues,
    })
  }

  const qualityValues = compactPoints([
    summary.averageConfidencePct === null
      ? null
      : { label: 'Confianza', value: summary.averageConfidencePct, caption: `${summary.averageConfidencePct}%`, source: 'Promedio de resultados importados' },
    summary.coveragePct === null
      ? null
      : { label: 'Cobertura', value: summary.coveragePct, caption: `${summary.coveragePct}%`, source: 'Respuestas detectadas sobre esperadas' },
    summary.evidenceCoveragePct === null
      ? null
      : { label: 'Evidencia', value: summary.evidenceCoveragePct, caption: `${summary.evidenceCoveragePct}%`, source: 'Instrumentos con archivos aceptados' },
  ])
  if (qualityValues.length > 0) {
    charts.push({
      id: 'evaluation-quality-signals',
      type: 'percentile',
      title: 'Señales de calidad del dato',
      unit: 'Porcentaje',
      source: 'Confianza, cobertura y evidencia',
      maxValue: 100,
      insight: 'Resume la solidez del dato antes de la interpretación profesional.',
      values: qualityValues,
    })
  }

  const applicabilityValues = compactPoints([
    { label: 'Aplicables', value: summary.applicableInstrumentCount, caption: String(summary.applicableInstrumentCount), source: 'Aplicabilidad normativa' },
    { label: 'No aplicables', value: summary.nonApplicableInstrumentCount, caption: String(summary.nonApplicableInstrumentCount), source: 'Aplicabilidad normativa' },
    { label: 'Por validar', value: summary.unknownApplicabilityCount, caption: String(summary.unknownApplicabilityCount), source: 'Aplicabilidad normativa' },
  ])
  if (applicabilityValues.length > 1) {
    charts.push({
      id: 'evaluation-applicability-distribution',
      type: 'stacked',
      title: 'Aplicabilidad normativa',
      unit: 'Instrumentos',
      source: 'Edad registrada y reglas del instrumento',
      maxValue: Math.max(summary.instrumentCount, 1),
      insight: 'Distingue instrumentos aplicables, fuera de rango o pendientes de validación.',
      values: applicabilityValues,
    })
  }

  return charts
}

function compactPoints(items: Array<InstrumentVisualizationPoint | null>): InstrumentVisualizationPoint[] {
  return items.filter((item): item is InstrumentVisualizationPoint => item !== null && item.value > 0)
}
