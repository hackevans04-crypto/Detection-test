import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import {
  createInstrumentPackage,
  type ExtractedResponse,
  type ExtractedResponseSet,
  type PackageFile,
} from '@/lib/instruments/import/package-model'
import { buildEvaluationAnalytics } from '@/lib/evaluations/analytics/build-evaluation-analytics'

function extractedResponse(overrides: Partial<ExtractedResponse>): ExtractedResponse {
  return {
    itemId: '1',
    rawValue: 'A',
    normalizedValue: 'A',
    sourceFile: 'respuestas.pdf',
    sourceLocation: null,
    confidence: 0.88,
    status: 'EXTRACTED',
    ...overrides,
  }
}

function acceptedFile(overrides: Partial<PackageFile>): PackageFile {
  return {
    id: crypto.randomUUID(),
    path: overrides.name ?? 'archivo.pdf',
    name: 'archivo.pdf',
    extension: 'pdf',
    declaredMime: 'application/pdf',
    detectedMime: 'application/pdf',
    size: 1024,
    checksum: 'checksum',
    role: 'QUESTION_BOOKLET',
    confidence: 0.9,
    evidence: [],
    status: 'ACCEPTED',
    reason: '',
    extractedFrom: null,
    ...overrides,
  }
}

function responseSet(overrides: Partial<ExtractedResponseSet>): ExtractedResponseSet {
  return {
    instrumentId: null,
    sourceFiles: ['respuestas.pdf'],
    totalItemsExpected: null,
    totalItemsExtracted: 0,
    completionRate: 0,
    responses: [],
    warnings: [],
    ...overrides,
  }
}

/**
 * Antes de este agregador, Step 7 (diagnósticos de step6-completion), el
 * panel de resultados importados y el informe calculaban por separado
 * versiones distintas de estos mismos números. Estas pruebas fijan el
 * contrato único del que ahora dependen los tres.
 */
describe('buildEvaluationAnalytics', () => {
  it('agrega materiales, respuestas y confianza real de un instrumento con resultados descriptivos', () => {
    const entry = createEvaluationInstrument({
      instrumentId: 'pkg-stai',
      name: 'STAI',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Profesional',
    })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-stai'
    pkg.name = 'STAI'
    pkg.files = [
      acceptedFile({ name: 'cuadernillo.pdf', role: 'QUESTION_BOOKLET' }),
      acceptedFile({ name: 'manual.pdf', role: 'MANUAL' }),
      acceptedFile({ name: 'borrador.pdf', role: 'UNKNOWN', status: 'REJECTED', reason: 'duplicado' }),
    ]
    pkg.computedResults = [
      { measureId: 'estado', label: 'Ansiedad estado', rawValue: '38', transformedValue: null, percentile: 65, classification: 'Medio', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!B2', confidence: 0.87 },
      { measureId: 'rasgo', label: 'Ansiedad rasgo', rawValue: '44', transformedValue: null, percentile: 78, classification: 'Alto', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!C2', confidence: 0.83 },
    ]
    pkg.extractedResponses = [
      responseSet({
        totalItemsExpected: 40,
        totalItemsExtracted: 40,
        completionRate: 1,
        responses: [
          extractedResponse({ itemId: '1' }),
          extractedResponse({ itemId: '2' }),
          extractedResponse({ itemId: '3' }),
          extractedResponse({ itemId: '4', status: 'AMBIGUOUS', confidence: 0.45 }),
        ],
      }),
    ]

    const evaluation = makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })
    const analytics = buildEvaluationAnalytics(evaluation)

    expect(analytics.summary).toMatchObject({
      instrumentCount: 1,
      packageCount: 1,
      processedFiles: 2, // sólo los ACCEPTED cuentan; el rechazado queda fuera
      resultCount: 2,
      normativeInstrumentCount: 1,
      detectedResponses: 4,
      validResponses: 3, // descarta la respuesta AMBIGUOUS
      coveragePct: 100,
    })
    // Promedio real de (0.87 + 0.83) / 2 = 0.85 -> 85%, no un número inventado.
    expect(analytics.summary.averageConfidencePct).toBe(85)

    const [instrument] = analytics.instruments
    expect(instrument.name).toBe('STAI')
    expect(instrument.materials).toEqual(['Cuadernillo', 'Manual'])
    expect(instrument.sourceCount).toBe(2)
    expect(instrument.averageConfidencePct).toBe(85)
    expect(instrument.responseCoverage).toEqual({ detected: 40, expected: 40, pct: 100 })
    expect(instrument.charts).toHaveLength(1)
    expect(instrument.charts[0].type).toBe('percentile')
  })

  it('no inventa cobertura ni confianza cuando el instrumento no las declara', () => {
    const entry = createEvaluationInstrument({
      instrumentId: 'pkg-bender',
      name: 'BENDER',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Profesional',
    })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-bender'
    pkg.name = 'BENDER'
    pkg.files = [acceptedFile({ name: 'cuadernillo.pdf', role: 'QUESTION_BOOKLET' })]
    // Sin computedResults ni extractedResponses: digitalizado sin respuestas puntuables.

    const evaluation = makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })
    const analytics = buildEvaluationAnalytics(evaluation)

    expect(analytics.summary).toMatchObject({
      noResultInstrumentCount: 1,
      resultCount: 0,
      averageConfidencePct: null,
      coveragePct: null,
      detectedResponses: 0,
      validResponses: 0,
    })
    const [instrument] = analytics.instruments
    expect(instrument.status).toBe('NO_RESULTS')
    expect(instrument.averageConfidencePct).toBeNull()
    expect(instrument.responseCoverage).toEqual({ detected: 0, expected: null, pct: null })
    expect(instrument.charts).toEqual([])
  })
})
