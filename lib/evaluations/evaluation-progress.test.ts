import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument, type Evaluation } from '@/lib/evaluations/model'
import { completeBackground, makeEvaluation } from '@/lib/evaluations/test-factory'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import { createInstrumentPackage } from '@/lib/instruments/import/package-model'
import {
  canNavigateToStep,
  getEvaluationProgress,
  getStep7CompletionState,
  getStep8CompletionState,
} from '@/lib/evaluations/evaluation-progress'
import { buildConclusionEvidence } from '@/lib/evaluations/conclusion-evidence'

describe('evaluation progress', () => {
  it('no completa paso 7 sin resultados', () => {
    const evaluation = makeEvaluation()

    expect(getStep7CompletionState(evaluation)).toMatchObject({ complete: false })
  })

  it('marca paso 7 como completado con limitaciones cuando hay resultado descriptivo', () => {
    const evaluation = evaluationWithPackage({ readiness: 'PARTIAL_READY' })

    expect(getStep7CompletionState(evaluation)).toMatchObject({
      complete: true,
      limited: true,
    })
  })

  it('marca paso 7 como completado cuando hay resultados completos', () => {
    const evaluation = evaluationWithPackage({ readiness: 'READY' })

    expect(getStep7CompletionState(evaluation)).toMatchObject({
      complete: true,
      limited: false,
    })
  })

  it('en conclusiones pinta paso 7 completado y paso 8 activo', () => {
    const evaluation = evaluationWithPackage({ readiness: 'READY' })
    const progress = getEvaluationProgress(evaluation, 'conclusiones')

    expect(progress[6]).toMatchObject({ id: 'results', status: 'COMPLETED' })
    expect(progress[7]).toMatchObject({ id: 'conclusions', status: 'ACTIVE' })
    expect(canNavigateToStep(evaluation, 'conclusiones')).toBe(true)
  })

  it('mantiene el estado tras refresh porque deriva de los datos persistidos', () => {
    const persisted = JSON.parse(JSON.stringify(evaluationWithPackage({ readiness: 'READY' })))
    const progress = getEvaluationProgress(persisted, 'conclusiones')

    expect(progress[6].status).toBe('COMPLETED')
    expect(progress[7].status).toBe('ACTIVE')
  })

  it('genera borradores AI_DRAFT cuando hay evidencia y no hay conclusiones', () => {
    const evaluation = evaluationWithPackage({ readiness: 'READY' })
    const evidence = buildConclusionEvidence(evaluation)

    expect(evaluation.conclusions).toHaveLength(0)
    expect(evidence.suggestedConclusions.length).toBeGreaterThan(0)
    expect(evidence.suggestedConclusions[0]).toMatchObject({ status: 'AI_DRAFT' })
    expect(getStep8CompletionState(evaluation)).toMatchObject({ complete: false })
  })
})

function evaluationWithPackage({ readiness }: { readiness: 'READY' | 'PARTIAL_READY' }) {
  const entry = createEvaluationInstrument({
    instrumentId: 'pkg-blind',
    name: 'Escala Ciega',
    order: 1,
    applicationMode: 'IMPORTED',
    professionalId: 'prof',
    professionalName: 'Profesional',
  })
  const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
  pkg.id = 'pkg-blind'
  pkg.name = 'Escala Ciega'
  pkg.stage = 'REVIEW'
  pkg.readiness = readiness
  pkg.files = [
    {
      id: 'file-1',
      path: 'resultados.xlsx',
      name: 'resultados.xlsx',
      extension: 'xlsx',
      declaredMime: '',
      detectedMime: null,
      size: 100,
      checksum: 'file-1',
      role: 'AUTOMATED_SPREADSHEET',
      confidence: 0.9,
      evidence: ['Hoja de resultados verificada.'],
      status: 'ACCEPTED',
      reason: '',
      extractedFrom: null,
    },
  ]
  pkg.computedResults = [
    {
      measureId: 'total',
      label: 'Total',
      rawValue: '30',
      transformedValue: readiness === 'READY' ? 'T60' : null,
      percentile: readiness === 'READY' ? 75 : null,
      classification: readiness === 'READY' ? 'Promedio alto' : null,
      sourceFile: 'resultados.xlsx',
      sourceLocation: 'Resultados!A1',
      confidence: 0.88,
    },
  ]
  return makeEvaluation({
    currentStep: 'conclusiones',
    background: completeBackground(),
    functionalAreas: completeFunctionalAreas(),
    battery: [entry],
    instrumentPackages: [pkg],
  })
}

function completeFunctionalAreas(): Evaluation['functionalAreas'] {
  const base = makeEvaluation()
  return Object.fromEntries(
    functionalAreaSchema.map((schema) => [
      schema.id,
      {
        ...base.functionalAreas[schema.id],
        description: 'Registrado.',
        performance: 'Adecuado',
        fields: Object.fromEntries(schema.fields.map((field) => [field.id, field.options[0]])),
      },
    ]),
  ) as Evaluation['functionalAreas']
}
