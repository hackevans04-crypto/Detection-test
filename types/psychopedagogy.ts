export type ResponseType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'written'
  | 'numeric'
  | 'ordering'
  | 'matching'
  | 'drag_drop'
  | 'visual_selection'
  | 'drawing'
  | 'oral_record'
  | 'observed_execution'
  | 'scale'
  | 'manual_score'

export type EvaluationMode = 'practice' | 'evaluation'
export type EvaluationStatus = 'BORRADOR' | 'EN PROGRESO' | 'COMPLETADA' | 'REVISADA' | 'INFORME GENERADO'
export type InstrumentId = 'test-abc' | 'pro-calculo'

export type Activity = {
  id: string
  enunciado: string
  instrucciones: string
  tipoRespuesta: ResponseType
  opciones?: string[]
  recurso?: string
  puntuacionMaxima: number
  criterio: string
  obligatoria: boolean
  observacion?: string
}

export type Subtest = {
  id: string
  numero: number
  nombre: string
  area: string
  instrucciones: string
  actividades: Activity[]
  puntajeMaximo: number
  criterioCorreccion: string
}

export type Instrument = {
  id: InstrumentId
  version: string
  nombre: string
  autor: string
  objetivo: string
  edadMin: number
  edadMax: number
  rangoTexto: string
  tiempo: string
  aplicacion: string
  descripcion: string
  instrucciones: string
  areas: string[]
  subtests: Subtest[]
  baremos: Array<{ min?: number; max?: number; rango: string; nivel: string; descripcion: string }>
  reglasInterpretacion: string[]
  recomendaciones: string[]
  normativeStatus: string
}

export type StudentData = {
  fullName: string
  birthDate: string
  ageYears: number
  identification: string
  institution: string
  grade: string
  tutor: string
  representative: string
  phone: string
  email: string
  evaluationDate: string
  evaluator: string
  reason: string
  initialObservations: string
}

export type ResponseRecord = {
  id: string
  evaluationId: string
  activityId: string
  responseValue: string
  score: number
  evaluatorScore: number
  evaluatorObservation: string
  answeredAt: string
}

export type PsychopedagogicalObservation = {
  bodyKnowledge: string
  bodyKnowledgeNotes: string
  lateralDominanceEye: string
  lateralDominanceEar: string
  lateralDominanceHand: string
  lateralDominanceFoot: string
  lateralDominanceNotes: string
  allopsychicOrientation: string
  autopsychicOrientation: string
  grossMotor: string
  fineMotor: string
  psycholinguistic: string
  notes: string
}

export type EvaluationRecord = {
  id: string
  code: string
  student: StudentData
  instrumentId: InstrumentId
  instrumentVersionId: string
  evaluatorId: string
  mode: EvaluationMode
  startedAt: string
  completedAt?: string
  status: EvaluationStatus
  currentSubtest: number
  responses: Record<string, ResponseRecord>
  totalScore?: number
  range?: string
  level?: string
  interpretation?: string
  ageWarning: boolean
  ageWarningConfirmed: boolean
  observations: PsychopedagogicalObservation
  conclusions: string
  recommendations: string
  createdAt: string
  updatedAt: string
}

export type ABCResult = {
  kind: 'abc'
  total: number
  range: string
  level: string
  subtests: Array<{ id: string; numero: number; nombre: string; area: string; score: number; max: number }>
  interpretation: string
  strengths: string[]
  supportAreas: string[]
  warnings: string[]
  recommendations: string[]
}

export type ProCalculoResult = {
  kind: 'pro-calculo'
  pdTotal: number
  ptGlobal?: number
  ptGlobalManual: boolean
  rows: Array<{ id: string; subtest: string; pd: number; pt?: number; classification: string; manualPt: boolean; observations: string }>
  interpretation: string
  strengths: string[]
  supportAreas: string[]
  warnings: string[]
  recommendations: string[]
}

export type InstrumentResult = ABCResult | ProCalculoResult
