import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { canCloseStep6, getStep6CompletionState } from '@/lib/instruments/step6-completion'
import { createInstrumentPackage, type InstrumentPackage, type PackageFileRole } from '@/lib/instruments/import/package-model'

describe('step 6 completion state', () => {
  it('no cierra cuando no hay instrumentos ni paquetes', () => {
    const state = getStep6CompletionState(makeEvaluation())

    expect(state.status).toBe('NOT_STARTED')
    expect(canCloseStep6(state)).toBe(false)
  })

  it('no cierra mientras el paquete sigue procesando', () => {
    const state = getStep6CompletionState(evaluationWithPackage({ stage: 'DOCUMENT_ANALYSIS', readiness: 'PARTIALLY_STRUCTURED' }))

    expect(state.status).toBe('PROCESSING')
    expect(canCloseStep6(state)).toBe(false)
  })

  it('cierra y entrega bundle cuando existen resultados calculados', () => {
    const state = getStep6CompletionState(
      evaluationWithPackage({
        readiness: 'PARTIAL_READY',
        computedResults: [
          {
            measureId: 'estado',
            label: 'Ansiedad estado',
            rawValue: '42',
            transformedValue: null,
            percentile: null,
            classification: null,
            sourceFile: 'STAI.xls',
            sourceLocation: 'Resultados!B2',
            confidence: 0.82,
          },
        ],
      }),
    )

    expect(state.status).toBe('PARTIAL_RESULTS')
    expect(canCloseStep6(state)).toBe(true)
    expect(state.bundles).toHaveLength(1)
    expect(state.diagnostics.computedResults).toBe(1)
  })

  it('cierra con limitación trazable cuando sólo hay material aceptado sin respuestas', () => {
    const state = getStep6CompletionState(evaluationWithPackage({ readiness: 'READY' }))

    expect(state.status).toBe('COMPLETED_WITH_LIMITATIONS')
    expect(canCloseStep6(state)).toBe(true)
    expect(state.bundles).toHaveLength(0)
    expect(state.limitations.join(' ')).toContain('No se encontró una aplicación completada')
    expect(state.diagnostics.acceptedFiles).toBe(1)
  })
})

function evaluationWithPackage(overrides: Partial<InstrumentPackage> = {}) {
  const entry = createEvaluationInstrument({
    instrumentId: 'pkg-stai',
    name: 'STAI',
    order: 1,
    applicationMode: 'IMPORTED',
    professionalId: 'prof',
    professionalName: 'Profesional',
  })
  const pkg = {
    ...createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' }),
    id: 'pkg-stai',
    name: 'STAI',
    stage: 'REVIEW' as const,
    readiness: 'READY' as const,
    files: [packageFile('MANUAL')],
    ...overrides,
  }

  return makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })
}

function packageFile(role: PackageFileRole) {
  return {
    id: `file-${role}`,
    path: `${role}.pdf`,
    name: `${role}.pdf`,
    extension: '.pdf',
    declaredMime: 'application/pdf',
    detectedMime: 'application/pdf',
    size: 1024,
    checksum: `${role}-checksum`,
    role,
    confidence: 0.9,
    evidence: ['Evidencia de prueba.'],
    status: 'ACCEPTED' as const,
    reason: '',
    extractedFrom: null,
  }
}
