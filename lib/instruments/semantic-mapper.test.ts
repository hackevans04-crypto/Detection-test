import { describe, expect, it } from 'vitest'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { mapRequiredFields } from '@/lib/instruments/semantic-field-mapper'

describe('semantic field mapper', () => {
  it('maps canonical blueprint paths to evaluation context with sourceStep', () => {
    const context = buildEvaluationContext(makeEvaluation())

    expect(
      mapRequiredFields(
        ['person.fullName', 'person.age', 'person.birthDate', 'academic.currentLevel', 'evaluation.reason', 'evaluation.date', 'professional.name'],
        context,
      ),
    ).toMatchObject([
      { targetPath: 'person.fullName', value: 'Evaluado de prueba', sourceStep: 'datos-iniciales', status: 'matched' },
      { targetPath: 'person.chronologicalAge', sourceStep: 'datos-iniciales', status: 'matched' },
      { targetPath: 'person.birthDate', value: '2020-02-01', sourceStep: 'datos-iniciales', status: 'matched' },
      { targetPath: 'academic.currentLevel', value: '1ro EGB', sourceStep: 'datos-iniciales', status: 'matched' },
      { targetPath: 'evaluation.reason', value: 'Motivo de prueba.', sourceStep: 'motivo', status: 'matched' },
      { targetPath: 'evaluation.date', value: '2026-08-01', sourceStep: 'datos-iniciales', status: 'matched' },
      { targetPath: 'evaluation.professional', value: 'Profesional de prueba', sourceStep: 'seleccion', status: 'matched' },
    ])
  })
})
