import type { Evaluation } from '@/lib/evaluations/model'
import type { ImportedComputedResult, ExtractedResponseSet } from '@/lib/instruments/import/package-model'
import type { InstrumentScoreResult } from '@/lib/instruments/scoring/instrument-scoring-engine'

export type InstrumentInterpretationDraft = {
  status: 'AI_DRAFT'
  summary: string
  findings: string[]
  strengths: string[]
  alerts: string[]
  limitations: string[]
  draftConclusion: string
  recommendations: string[]
}

export function buildInstrumentInterpretationDraft(input: {
  evaluation: Evaluation
  instrumentIdentity: string
  scoreResult: InstrumentScoreResult | null
  importedResults: ImportedComputedResult[]
  responseSet?: ExtractedResponseSet | null
  normativelyApplicable?: boolean
  limitations?: string[]
}): InstrumentInterpretationDraft {
  const findings: string[] = []
  const limitations = [...(input.limitations ?? [])]

  if (input.scoreResult?.overall?.rawScore !== null && input.scoreResult?.overall) {
    findings.push(`${input.scoreResult.overall.label}: puntuación directa ${input.scoreResult.overall.rawScore}.`)
    if (input.scoreResult.overall.percentile !== null) findings.push(`Percentil ${input.scoreResult.overall.percentile}.`)
    if (input.scoreResult.overall.classification) findings.push(`Clasificación: ${input.scoreResult.overall.classification}.`)
  }

  for (const result of input.importedResults) {
    const value = result.transformedValue ?? result.rawValue ?? (result.percentile !== null ? `P${result.percentile}` : null)
    if (value) findings.push(`${result.label}: ${value} importado desde ${result.sourceFile}.`)
  }

  if (input.responseSet && input.responseSet.totalItemsExtracted > 0) {
    findings.push(`${input.responseSet.totalItemsExtracted} respuestas extraídas de material del evaluado.`)
  }

  if (input.normativelyApplicable === false) {
    limitations.push('Resultado descriptivo disponible sin interpretación normativa para la referencia cargada.')
  }
  if (findings.length === 0) limitations.push('No existen resultados suficientes para interpretar el instrumento.')

  return {
    status: 'AI_DRAFT',
    summary: findings.length
      ? `${input.instrumentIdentity}: borrador basado exclusivamente en resultados disponibles y evidencia cargada.`
      : `${input.instrumentIdentity}: sin resultados interpretables todavía.`,
    findings,
    strengths: [],
    alerts: input.normativelyApplicable === false ? ['Aplicabilidad normativa no confirmada para la referencia disponible.'] : [],
    limitations,
    draftConclusion: findings.length
      ? 'Los hallazgos deben integrarse con entrevista, observación clínica y el resto del expediente antes de emitir conclusiones.'
      : 'Se requiere incorporar respuestas o resultados verificables antes de emitir una conclusión instrumental.',
    recommendations: findings.length ? ['Revisar trazabilidad y aprobar profesionalmente el borrador antes de usarlo en informe.'] : [],
  }
}
