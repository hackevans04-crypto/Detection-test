import { describe, expect, it } from 'vitest'
import { completeBackground, makeApplication, makeEvaluation } from '@/lib/evaluations/test-factory'
import {
  currentStageLabel,
  deriveInstrumentStatus,
  deriveStatus,
  evaluationProgress,
  isStepComplete,
  missingInitialDataFields,
  resumeStep,
} from '@/lib/evaluations/progress'
import type { Evaluation } from '@/lib/evaluations/model'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'

const abcFull = makeApplication('test-abc', {
  'abc-1': { pd: '1' },
  'abc-2': { pd: '2' },
  'abc-3': { pd: '2' },
  'abc-4': { pd: '2' },
  'abc-5': { pd: '3' },
  'abc-6': { pd: '2' },
  'abc-7': { pd: '0' },
  'abc-8': { pd: '1' },
})

/** Evaluación con las ocho etapas de contenido cerradas. */
function completeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  const base = makeEvaluation()
  const functionalAreas = Object.fromEntries(
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
  return makeEvaluation({
    background: completeBackground(),
    referral: { ...base.referral, reason: 'Motivo registrado.', source: 'Institución de prueba' },
    functionalAreas,
    instrumentApplications: { 'test-abc': abcFull },
    interpretation: 'Interpretación redactada.',
    conclusions: [{ id: 'conclusion-1', text: 'Conclusiones redactadas.', createdAt: '2026-08-01T10:00:00.000Z' }],
    recommendations: {
      docentes: [{ id: 'recommendation-1', text: 'Apoyos concretos.', createdAt: '2026-08-01T10:00:00.000Z' }],
      'pedagogo-apoyo': [],
      dece: [],
      'representante-legal': [],
      psicopedagogo: [],
    },
    ...overrides,
  })
}

describe('validación del paso 1', () => {
  it('exige los seis campos marcados como obligatorios', () => {
    const evaluation = makeEvaluation()
    evaluation.initialData.person.fullName = ''
    evaluation.initialData.person.grade = ''
    expect(missingInitialDataFields(evaluation)).toEqual(['Nombres y apellidos', 'Grado o curso'])
  })

  it('acepta la ficha completa', () => {
    expect(missingInitialDataFields(makeEvaluation())).toEqual([])
  })
})

describe('completitud por etapa', () => {
  it('marca contexto sólo cuando todos los bloques obligatorios están escritos', () => {
    expect(isStepComplete(makeEvaluation(), 'contexto')).toBe(false)
    expect(isStepComplete(makeEvaluation({ background: completeBackground() }), 'contexto')).toBe(true)
  })

  it('exige todas las áreas funcionales configuradas', () => {
    expect(isStepComplete(makeEvaluation(), 'areas')).toBe(false)
    expect(isStepComplete(completeEvaluation(), 'areas')).toBe(true)
  })

  it('exige que cada instrumento iniciado quede completo', () => {
    const partial = makeApplication('test-abc', { 'abc-1': { pd: '2' } })
    expect(isStepComplete(makeEvaluation({ instrumentApplications: { 'test-abc': partial } }), 'instrumentos')).toBe(false)
    expect(isStepComplete(makeEvaluation({ instrumentApplications: { 'test-abc': abcFull } }), 'instrumentos')).toBe(true)
  })

  it('no da instrumentos por completos cuando no hay ninguno', () => {
    expect(isStepComplete(makeEvaluation(), 'instrumentos')).toBe(false)
  })

  it('basta con un grupo de recomendaciones', () => {
    expect(isStepComplete(makeEvaluation(), 'recomendaciones')).toBe(false)
    expect(isStepComplete(completeEvaluation(), 'recomendaciones')).toBe(true)
  })

  it('el informe sólo se cierra al generarlo', () => {
    expect(isStepComplete(completeEvaluation(), 'informe')).toBe(false)
    const generated = completeEvaluation({
      report: { status: 'GENERATED', generatedAt: '2026-08-02T10:00:00.000Z', fileName: 'informe.pdf', professional: { name: '', role: '', registryNumber: '', date: '2026-08-01' } },
    })
    expect(isStepComplete(generated, 'informe')).toBe(true)
  })
})

describe('estado de la evaluación', () => {
  it('es borrador mientras falten datos iniciales', () => {
    const evaluation = makeEvaluation()
    evaluation.initialData.person.fullName = ''
    expect(deriveStatus(evaluation)).toBe('DRAFT')
  })

  it('pasa a en proceso con la ficha completa y etapas pendientes', () => {
    expect(deriveStatus(makeEvaluation())).toBe('IN_PROGRESS')
  })

  it('pasa a por finalizar cuando las ocho etapas de contenido están cerradas', () => {
    expect(deriveStatus(completeEvaluation())).toBe('READY_FOR_REVIEW')
  })

  it('pasa a finalizada al generar el informe', () => {
    const generated = completeEvaluation({
      report: { status: 'GENERATED', generatedAt: '2026-08-02T10:00:00.000Z', fileName: 'informe.pdf', professional: { name: '', role: '', registryNumber: '', date: '2026-08-01' } },
    })
    expect(deriveStatus(generated)).toBe('COMPLETED')
  })
})

describe('progreso', () => {
  it('cuenta nueve etapas y redondea el porcentaje', () => {
    const progress = evaluationProgress(makeEvaluation())
    expect(progress.totalSteps).toBe(9)
    expect(progress.completedSteps).toBe(2)
    expect(progress.percent).toBe(22)
  })

  it('llega al 100 % de contenido sin el informe generado', () => {
    const progress = evaluationProgress(completeEvaluation())
    expect(progress.contentPercent).toBe(100)
    expect(progress.percent).toBe(89)
    expect(progress.pendingSteps).toEqual([])
  })

  it('la etapa actual es la primera pendiente', () => {
    expect(resumeStep(makeEvaluation())).toBe('contexto')
    expect(currentStageLabel(makeEvaluation())).toBe('Contexto y antecedentes')
    expect(resumeStep(completeEvaluation())).toBe('informe')
  })
})

describe('estado de aplicación de un instrumento', () => {
  it('distingue sin iniciar, en proceso y completado', () => {
    expect(deriveInstrumentStatus(makeApplication('test-abc', {}))).toBe('NOT_STARTED')
    expect(deriveInstrumentStatus(makeApplication('test-abc', { 'abc-1': { pd: '2' } }))).toBe('IN_PROGRESS')
    expect(deriveInstrumentStatus(abcFull)).toBe('COMPLETED')
  })

  it('un cero cuenta como registrado, una cadena vacía no', () => {
    expect(deriveInstrumentStatus(makeApplication('test-abc', { 'abc-1': { pd: '0' } }))).toBe('IN_PROGRESS')
    expect(deriveInstrumentStatus(makeApplication('test-abc', { 'abc-1': { pd: '' } }))).toBe('NOT_STARTED')
  })
})
