import type { Evaluation, EvaluationInstrument } from '@/lib/evaluations/model'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { getInstrumentCapabilities } from '@/features/evaluations/instruments/center/instrument-capabilities'
import { buildInstrumentInterpretationDraft, type InstrumentInterpretationDraft } from '@/lib/instruments/instrument-interpretation-service'
import type { InstrumentPackage } from '@/lib/instruments/import/package-model'
import { resolveNormativeApplicability } from '@/lib/instruments/instrument-registry'

export type InstrumentResultBundle = {
  instrumentId: string
  instrumentIdentity: string
  status: 'NO_RESULTS' | 'RAW_READY' | 'DESCRIPTIVE_READY' | 'NORMATIVE_READY'
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN'
  results: Array<{
    label: string
    value: string
    source: string
    numericValue?: number | null
    percentile?: number | null
    classification?: string | null
    /** Confianza de extracción (0-1). `null` para entradas registradas a mano: no aplica. */
    confidence?: number | null
  }>
  charts: Array<{ id: string; title: string; type: 'bar' | 'percentile'; values: Array<{ label: string; value: number }> }>
  interpretation: InstrumentInterpretationDraft
  limitations: string[]
  evidence: string[]
  reportStatus: EvaluationInstrument['report']['status']
}

export type EvaluationResultsSummary = {
  instrumentsProcessed: number
  instrumentsWithResults: number
  quantitativeResults: number
  qualitativeFindings: string[]
  areas: string[]
  convergences: string[]
  discrepancies: string[]
  evidenceCoverage: number
  limitations: string[]
  bundles: InstrumentResultBundle[]
}

export function buildInstrumentResultBundles(evaluation: Evaluation): InstrumentResultBundle[] {
  const context = buildEvaluationContext(evaluation)
  const years = parseYears(context.person.chronologicalAge.value)

  return evaluation.battery.map((entry) => {
    const pkg = findPackage(evaluation, entry)
    const normativeApplicable = isNormativelyApplicable(entry, pkg, years)
    const capabilities = getInstrumentCapabilities({ entry, pkg, normativelyApplicable: normativeApplicable })
    const imported = pkg?.computedResults ?? []
    const directResults = Object.entries(entry.scores)
      .filter(([, score]) => score.value.trim())
      .map(([id, score]) => ({
        label: id.split('.').pop() ?? id,
        value: score.value,
        source: 'Registro del instrumento',
        numericValue: toNumber(score.value),
        percentile: null,
        classification: null,
        confidence: null,
      }))
    const importedResults = imported
      .map((result) => ({
        label: result.label,
        value: result.transformedValue ?? result.rawValue ?? (result.percentile !== null ? `P${result.percentile}` : ''),
        source: result.sourceLocation ? `${result.sourceFile} · ${result.sourceLocation}` : result.sourceFile,
        numericValue: toNumber(result.transformedValue ?? result.rawValue ?? ''),
        percentile: result.percentile,
        classification: result.classification,
        confidence: result.confidence,
      }))
      .filter((result) => result.value)
    const results = [...directResults, ...importedResults]
    const limitations = capabilities.canViewNormativeResults
      ? []
      : [
          normativeApplicable
            ? 'Sin interpretación normativa completa disponible.'
            : 'Instrumento fuera del rango normativo para la edad registrada; se conservan resultados descriptivos verificables.',
        ]
    const interpretation = buildInstrumentInterpretationDraft({
      evaluation,
      instrumentIdentity: capabilities.identity.name,
      scoreResult: null,
      importedResults: imported,
      responseSet: pkg?.extractedResponses?.[0] ?? null,
      normativelyApplicable: capabilities.canViewNormativeResults,
      limitations,
    })

    return {
      instrumentId: entry.instrumentId,
      instrumentIdentity: capabilities.identity.name,
      status: capabilities.canViewNormativeResults ? 'NORMATIVE_READY' : results.length ? 'DESCRIPTIVE_READY' : 'NO_RESULTS',
      applicability: normativeApplicable ? (capabilities.canViewNormativeResults ? 'APPLICABLE' : 'UNKNOWN') : 'NOT_APPLICABLE',
      results,
      charts: makeCharts(results),
      interpretation,
      limitations,
      evidence: [...(pkg?.files.filter((file) => file.status === 'ACCEPTED').map((file) => file.name) ?? [])],
      reportStatus: entry.report.status,
    }
  })
}

export function aggregateEvaluationResults(evaluation: Evaluation): EvaluationResultsSummary {
  const bundles = buildInstrumentResultBundles(evaluation)
  const withResults = bundles.filter((bundle) => bundle.results.length > 0)
  const limitations = [...new Set(bundles.flatMap((bundle) => bundle.limitations))]

  return {
    instrumentsProcessed: bundles.length,
    instrumentsWithResults: withResults.length,
    quantitativeResults: withResults.reduce((sum, bundle) => sum + bundle.results.length, 0),
    qualitativeFindings: bundles.flatMap((bundle) => bundle.interpretation.findings),
    areas: [...new Set(evaluation.battery.flatMap((entry) => entry.linkedAreas))],
    convergences: withResults.length > 1 ? ['Existen resultados de más de un instrumento para integración profesional.'] : [],
    discrepancies: [],
    evidenceCoverage: bundles.length ? withResults.length / bundles.length : 0,
    limitations,
    bundles,
  }
}

function findPackage(evaluation: Evaluation, entry: EvaluationInstrument): InstrumentPackage | undefined {
  // `blueprintId` es `null` por defecto en ambos lados: comparar sin más
  // hacía que `null === null` emparejara el primer paquete de la lista con
  // cualquier instrumento de la batería que no tuviera blueprint asignado.
  return evaluation.instrumentPackages.find(
    (pkg) => pkg.id === entry.instrumentId || (entry.blueprintId !== null && pkg.blueprintId === entry.blueprintId),
  )
}

function makeCharts(results: Array<{ label: string; value: string }>): InstrumentResultBundle['charts'] {
  const values = results
    .map((result) => ({ label: result.label, value: Number(String(result.value).replace(/^P/i, '')) }))
    .filter((result) => Number.isFinite(result.value))
  return values.length ? [{ id: 'resultados', title: 'Resultados disponibles', type: 'bar', values }] : []
}

function toNumber(value: string | null | undefined) {
  const parsed = Number((value ?? '').trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function isNormativelyApplicable(entry: EvaluationInstrument, pkg: InstrumentPackage | undefined, years: number | null) {
  const applicability = resolveNormativeApplicability(
    [entry.name, entry.subtitle, pkg?.name, pkg?.fingerprint.acronym],
    years,
  )
  return applicability.status !== 'NOT_APPLICABLE'
}

function parseYears(age?: string | null) {
  const match = /(\d{1,2})/.exec(age ?? '')
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}
