import { describe, expect, it } from 'vitest'
import { archivedInstruments } from '@/instruments/legacy-archive'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { makeApplication, makeEvaluation } from '@/lib/evaluations/test-factory'
import { evaluateInstrumentEligibility } from '@/lib/instruments/eligibility-engine'
import { scoreInstrumentApplication } from '@/lib/instruments/scoring-engine'
import { mapRequiredFields } from '@/lib/instruments/semantic-field-mapper'

describe('universal instrument engine', () => {
  it('maps common requested fields to structured evaluation context', () => {
    const evaluation = makeEvaluation()
    const context = buildEvaluationContext(evaluation)

    const fields = mapRequiredFields(['Nombre del examinado', 'Edad cronológica', 'Curso escolar actual'], context)

    expect(fields).toMatchObject([
      { targetPath: 'person.fullName', value: 'Evaluado de prueba', status: 'matched' },
      { targetPath: 'person.chronologicalAge', status: 'matched' },
      { targetPath: 'academic.currentLevel', value: '1ro EGB', status: 'matched' },
    ])
  })

  it('does not fill unknown semantic fields with invented data', () => {
    const context = buildEvaluationContext(makeEvaluation())

    expect(mapRequiredFields(['Número de expediente externo'], context)[0]).toMatchObject({
      targetPath: null,
      value: null,
      status: 'required',
    })
  })

  it('marks age-incompatible instruments as not applicable', () => {
    const adultEvaluation = makeEvaluation({
      initialData: {
        ...makeEvaluation().initialData,
        person: { ...makeEvaluation().initialData.person, birthDate: '1998-01-01' },
      },
    })

    expect(evaluateInstrumentEligibility(adultEvaluation, archivedInstruments[0]).status).toBe('NOT_APPLICABLE')
  })

  it('scores the same complete input deterministically without using AI', () => {
    const application = makeApplication('test-abc', {
      'abc-1': { pd: '3' },
      'abc-2': { pd: '3' },
      'abc-3': { pd: '3' },
      'abc-4': { pd: '3' },
      'abc-5': { pd: '3' },
      'abc-6': { pd: '2' },
      'abc-7': { pd: '2' },
      'abc-8': { pd: '1' },
    })

    const first = scoreInstrumentApplication(application)
    const second = scoreInstrumentApplication(application)

    expect(first).toEqual(second)
    expect(first).toMatchObject({ totalPd: 20, classification: 'RANGO I', normVersion: 'norms-unavailable' })
  })
})
