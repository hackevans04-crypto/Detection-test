import { backgroundSchema, fieldKey } from '@/lib/evaluations/background-schema'
import {
  createInstrumentApplication,
  emptyBackground,
  emptyInitialData,
  emptyRecommendations,
  type Background,
  type Evaluation,
} from '@/lib/evaluations/model'

/** Antecedentes con todos los campos obligatorios rellenos. */
export function completeBackground(): Background {
  const background = emptyBackground()
  for (const tab of backgroundSchema) {
    for (const block of tab.blocks) {
      for (const field of block.fields) {
        if (field.optional) continue
        background[tab.id][fieldKey(block.id, field.id)] = field.options?.[0] ?? 'Registrado.'
      }
    }
  }
  return background
}

export function makeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  const initialData = emptyInitialData()
  initialData.person.fullName = 'Evaluado de prueba'
  initialData.person.birthDate = '2020-02-01'
  initialData.person.institution = 'Institución de prueba'
  initialData.person.grade = '1ro EGB'
  initialData.evaluationDate = '2026-08-01'

  return {
    id: 'eval-test',
    code: 'EV-2026-0001',
    evaluatorId: 'user-test',
    evaluatorName: 'Profesional de prueba',
    institutionId: 'inst-test',
    status: 'DRAFT',
    currentStep: 'datos-iniciales',
    initialData,
    background: emptyBackground(),
    referral: { reason: 'Motivo de prueba.', source: 'Institución de prueba', officeNumber: '', officeDate: '', documentNumber: '', requestText: '' },
    functionalAreas: makeEvaluationAreas(),
    instrumentApplications: {},
    interpretation: '',
    conclusions: [],
    recommendations: emptyRecommendations(),
    report: { status: 'NOT_READY', generatedAt: null, fileName: null, professional: { name: '', role: '', registryNumber: '', date: '2026-08-01' } },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
    interventions: overrides.interventions ?? [],
  }
}

function makeEvaluationAreas() {
  return {
    'conocimiento-corporal': { description: '', performance: '', observations: '', fields: {} },
    'dominancia-lateral': { description: '', performance: '', observations: '', fields: {} },
    orientacion: { description: '', performance: '', observations: '', fields: {} },
    'motricidad-gruesa': { description: '', performance: '', observations: '', fields: {} },
    'motricidad-fina': { description: '', performance: '', observations: '', fields: {} },
    'habilidades-psicolinguisticas': { description: '', performance: '', observations: '', fields: {} },
  } as Evaluation['functionalAreas']
}

/** Aplicación con las `recorded` primeras unidades registradas. */
export function makeApplication(instrumentId: string, entries: Record<string, { pd: string; pt?: string }>) {
  const application = createInstrumentApplication(instrumentId)
  for (const [subtestId, value] of Object.entries(entries)) {
    application.entries[subtestId] = {
      pd: value.pd,
      pt: value.pt ?? '',
      observations: '',
      updatedAt: '2026-08-01T10:00:00.000Z',
    }
  }
  return application
}
