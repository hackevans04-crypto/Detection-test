import { describe, expect, it } from 'vitest'
import { buildEvaluationContext, displayAcademicLevel, evaluateInformationCompleteness } from '@/lib/evaluations/context-service'
import { completeBackground, makeEvaluation } from '@/lib/evaluations/test-factory'

describe('evaluation context integration', () => {
  it('step 3 saved reason is available in instruments context', () => {
    const evaluation = makeEvaluation({
      referral: {
        reason: 'Dificultades sostenidas de atención en aula.',
        source: 'DECE',
        officeNumber: '',
        officeDate: '',
        documentNumber: '',
        requestText: '',
      },
    })

    const context = buildEvaluationContext(evaluation)

    expect(context.evaluation.reason).toMatchObject({
      value: 'Dificultades sostenidas de atención en aula.',
      sourceStep: 'motivo',
      confidence: 1,
    })
  })

  it('step 4 saved background is available in instruments context', () => {
    const context = buildEvaluationContext(makeEvaluation({ background: completeBackground() }))

    expect(context.context.availableSections.value).toContain('contexto-educativo')
    expect(context.context.availableSections.sourceStep).toBe('contexto')
  })

  it('step 5 saved areas are available in instruments context', () => {
    const evaluation = makeEvaluation()
    evaluation.functionalAreas['motricidad-fina'] = {
      description: 'Trazo irregular y prensión fatigable.',
      performance: 'En desarrollo',
      observations: '',
      fields: {},
    }

    const context = buildEvaluationContext(evaluation)

    expect(context.context.completedAreas.value).toContain('Motricidad fina')
    expect(context.context.completedAreas.sourceStep).toBe('areas')
  })

  it('does not expose numeric academic codes as professional-facing schooling', () => {
    expect(displayAcademicLevel('44')).toBe('No registrada')
    expect(evaluateInformationCompleteness(makeEvaluation()).level).toBe('PARTIAL')
  })
})
