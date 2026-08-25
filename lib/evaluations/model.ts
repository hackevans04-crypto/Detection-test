/**
 * Modelo canónico del expediente psicopedagógico.
 *
 * Sigue la estructura del informe real, no la de una aplicación de tests: una
 * evaluación es un expediente que acumula evidencia —identificación, motivo,
 * antecedentes, observación funcional, instrumentos— y termina en conclusiones,
 * recomendaciones e informe. Los instrumentos son una fuente de evidencia
 * dentro del proceso, nunca el proceso entero.
 */

export type EvaluationStatus = 'DRAFT' | 'IN_PROGRESS' | 'READY_FOR_REVIEW' | 'COMPLETED'
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
export type InstrumentApplicationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
export type ReportStatus = 'NOT_READY' | 'READY' | 'GENERATED'

export const stepIds = [
  'datos-iniciales',
  'motivo',
  'contexto',
  'areas',
  'instrumentos',
  'resultados',
  'conclusiones',
  'recomendaciones',
  'informe',
] as const

export type StepId = (typeof stepIds)[number]

export const stepLabels: Record<StepId, string> = {
  'datos-iniciales': 'Datos iniciales',
  motivo: 'Motivo y remitente',
  contexto: 'Contexto y antecedentes',
  areas: 'Áreas evaluadas',
  instrumentos: 'Instrumentos',
  resultados: 'Resultados e interpretación',
  conclusiones: 'Conclusiones',
  recomendaciones: 'Recomendaciones',
  informe: 'Informe final',
}

/** Nombres cortos para listas estrechas, donde el largo se truncaría. */
export const stepShortLabels: Record<StepId, string> = {
  'datos-iniciales': 'Datos iniciales',
  motivo: 'Motivo',
  contexto: 'Contexto',
  areas: 'Áreas',
  instrumentos: 'Instrumentos',
  resultados: 'Resultados',
  conclusiones: 'Conclusiones',
  recomendaciones: 'Recomendaciones',
  informe: 'Informe final',
}

// --------------------------------------------------------- 1. Identificación

export type Sex = '' | 'Masculino' | 'Femenino' | 'Prefiere no decirlo'

export type EvaluatedPerson = {
  fullName: string
  birthDate: string
  sex: Sex
  identification: string
  /** El informe registra discapacidad y porcentaje como campos propios. */
  disability: string
  disabilityPercent: string
  institution: string
  grade: string
  tutor: string
  address: string
  phone: string
  email: string
}

export type FamilyContact = {
  motherName: string
  fatherName: string
  guardianName: string
  guardianRelationship: string
  guardianPhone: string
  guardianEmail: string
}

export type InitialData = {
  person: EvaluatedPerson
  family: FamilyContact
  evaluationDate: string
}

// ------------------------------------------------------ 2. Motivo y remitente

/**
 * En el informe el remitente tiene entidad propia: hay un oficio, una fecha y
 * una institución que deriva el caso. Es lo que explica por qué existe toda la
 * evaluación, así que ocupa su propia etapa.
 */
export type Referral = {
  reason: string
  source: string
  officeNumber: string
  officeDate: string
  documentNumber: string
  requestText: string
}

// -------------------------------------------------- 3. Contexto y antecedentes

export const backgroundSectionIds = [
  'desarrollo',
  'salud',
  'autonomia',
  'familia',
  'historia-escolar',
  'contexto-educativo',
  'intervenciones',
] as const

export type BackgroundSectionId = (typeof backgroundSectionIds)[number]

export type Background = Record<BackgroundSectionId, Record<string, string>>

/** Los antecedentes de intervención son una lista, no un párrafo. */
export type Intervention = {
  id: string
  institution: string
  specialty: string
  documentType: string
  result: string
  year: string
}

// -------------------------------------------------- 4. Áreas evaluadas

export const functionalAreaIds = [
  'conocimiento-corporal',
  'dominancia-lateral',
  'orientacion',
  'motricidad-gruesa',
  'motricidad-fina',
  'habilidades-psicolinguisticas',
] as const

export type FunctionalAreaId = (typeof functionalAreaIds)[number]

export type Performance = '' | 'Adecuado' | 'En desarrollo' | 'Dificultad marcada'

export type FunctionalAreaRecord = {
  description: string
  performance: Performance
  observations: string
  /** Campos propios del área: lateralidad por segmento, tipo de orientación… */
  fields: Record<string, string>
}

export type FunctionalAreas = Record<FunctionalAreaId, FunctionalAreaRecord>

// ------------------------------------------------------------ 5. Instrumentos

/**
 * Registro de un subtest o subárea. La puntuación se guarda como texto para
 * distinguir «sin registrar» de «cero», que en puntuación directa no es lo
 * mismo.
 */
export type SubtestEntry = {
  pd: string
  pt: string
  observations: string
  updatedAt: string
}

export type InstrumentApplication = {
  instrumentId: string
  status: InstrumentApplicationStatus
  currentSubtestIndex: number
  entries: Record<string, SubtestEntry>
  /** Lectura profesional del instrumento, separada del cálculo. */
  interpretation: string
  /** El profesional confirmó aplicar fuera del rango de edad documentado. */
  ageWarningAcknowledged: boolean
  startedAt: string | null
  completedAt: string | null
}

// -------------------------------------------- 7 y 8. Conclusiones y recomendaciones

/** Cada conclusión y cada recomendación se guarda por separado. */
export type TextEntry = {
  id: string
  text: string
  createdAt: string
}

export const recommendationGroupIds = [
  'docentes',
  'pedagogo-apoyo',
  'dece',
  'representante-legal',
  'psicopedagogo',
] as const

export type RecommendationGroupId = (typeof recommendationGroupIds)[number]

export const recommendationGroupLabels: Record<RecommendationGroupId, string> = {
  docentes: 'Docentes',
  'pedagogo-apoyo': 'Pedagogo/a de apoyo',
  dece: 'DECE',
  'representante-legal': 'Representante legal',
  psicopedagogo: 'Psicopedagogo/a',
}

export type Recommendations = Record<RecommendationGroupId, TextEntry[]>

// ---------------------------------------------------------- 9. Informe final

export type ProfessionalSignature = {
  name: string
  role: string
  registryNumber: string
  date: string
}

export type EvaluationReport = {
  status: ReportStatus
  generatedAt: string | null
  fileName: string | null
  professional: ProfessionalSignature
}

// -------------------------------------------------------------- Expediente

export type Evaluation = {
  id: string
  code: string
  evaluatorId: string
  evaluatorName: string
  institutionId: string
  status: EvaluationStatus
  currentStep: StepId
  initialData: InitialData
  referral: Referral
  background: Background
  interventions: Intervention[]
  functionalAreas: FunctionalAreas
  instrumentApplications: Record<string, InstrumentApplication>
  /** Interpretación global de los resultados, distinta de la de cada instrumento. */
  interpretation: string
  conclusions: TextEntry[]
  recommendations: Recommendations
  report: EvaluationReport
  createdAt: string
  updatedAt: string
}

// ------------------------------------------------------------------ vacíos

export function emptyPerson(): EvaluatedPerson {
  return {
    fullName: '',
    birthDate: '',
    sex: '',
    identification: '',
    disability: '',
    disabilityPercent: '',
    institution: '',
    grade: '',
    tutor: '',
    address: '',
    phone: '',
    email: '',
  }
}

export function emptyFamily(): FamilyContact {
  return {
    motherName: '',
    fatherName: '',
    guardianName: '',
    guardianRelationship: '',
    guardianPhone: '',
    guardianEmail: '',
  }
}

export function emptyInitialData(): InitialData {
  return { person: emptyPerson(), family: emptyFamily(), evaluationDate: new Date().toISOString().slice(0, 10) }
}

export function emptyReferral(): Referral {
  return { reason: '', source: '', officeNumber: '', officeDate: '', documentNumber: '', requestText: '' }
}

export function emptyBackground(): Background {
  return {
    desarrollo: {},
    salud: {},
    autonomia: {},
    familia: {},
    'historia-escolar': {},
    'contexto-educativo': {},
    intervenciones: {},
  }
}

export function emptyFunctionalAreaRecord(): FunctionalAreaRecord {
  return { description: '', performance: '', observations: '', fields: {} }
}

export function emptyFunctionalAreas(): FunctionalAreas {
  return {
    'conocimiento-corporal': emptyFunctionalAreaRecord(),
    'dominancia-lateral': emptyFunctionalAreaRecord(),
    orientacion: emptyFunctionalAreaRecord(),
    'motricidad-gruesa': emptyFunctionalAreaRecord(),
    'motricidad-fina': emptyFunctionalAreaRecord(),
    'habilidades-psicolinguisticas': emptyFunctionalAreaRecord(),
  }
}

export function emptyRecommendations(): Recommendations {
  return { docentes: [], 'pedagogo-apoyo': [], dece: [], 'representante-legal': [], psicopedagogo: [] }
}

export function emptyProfessional(): ProfessionalSignature {
  return { name: '', role: '', registryNumber: '', date: new Date().toISOString().slice(0, 10) }
}

export function createInstrumentApplication(instrumentId: string): InstrumentApplication {
  return {
    instrumentId,
    status: 'NOT_STARTED',
    currentSubtestIndex: 0,
    entries: {},
    interpretation: '',
    ageWarningAcknowledged: false,
    startedAt: null,
    completedAt: null,
  }
}

export function emptySubtestEntry(): SubtestEntry {
  return { pd: '', pt: '', observations: '', updatedAt: '' }
}

export function newTextEntry(text = ''): TextEntry {
  return { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }
}

export function newIntervention(): Intervention {
  return { id: crypto.randomUUID(), institution: '', specialty: '', documentType: '', result: '', year: '' }
}
