/**
 * Modelo canónico del expediente psicopedagógico.
 *
 * Sigue la estructura del informe real, no la de una aplicación de tests: una
 * evaluación es un expediente que acumula evidencia —identificación, motivo,
 * antecedentes, observación funcional, instrumentos— y termina en conclusiones,
 * recomendaciones e informe. Los instrumentos son una fuente de evidencia
 * dentro del proceso, nunca el proceso entero.
 */

import type { InstrumentPackage } from '@/lib/instruments/import/package-model'

export type EvaluationStatus = 'DRAFT' | 'IN_PROGRESS' | 'READY_FOR_REVIEW' | 'COMPLETED'
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
export type InstrumentApplicationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
export type ReportStatus = 'NOT_READY' | 'READY' | 'GENERATED'
export type InstrumentIngestionStatus =
  | 'UPLOADED'
  | 'CLASSIFYING'
  | 'EXTRACTING'
  | 'STRUCTURING'
  | 'VALIDATING'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  /** El documento se procesó pero no pudo reconocerse como instrumento. */
  | 'UNIDENTIFIED'
  | 'FAILED'
export type InstrumentBlueprintStatus = 'DRAFT_AI' | 'REQUIRES_REVIEW' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED'
export type AutomationLevel = 'FULL' | 'WITH_REVIEW' | 'DIGITIZATION_ONLY' | 'BLOCKED'

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

export type InstrumentIngestionJob = {
  id: string
  evaluationId: string
  fileName: string
  fileType: string
  fileSize: number
  status: InstrumentIngestionStatus
  progress: number
  currentStage: string
  startedAt: string
  finishedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  attempts: number
  /**
   * Rastro del procesamiento para auditoría y diagnóstico. No se muestra en la
   * pantalla del profesional: qué proveedor y qué modelo procesaron un archivo
   * es materia de administración, no parte de la evaluación.
   */
  aiProvider: 'gemini'
  aiModel: string
  blueprintId: string | null
  createdBy: string
}

/**
 * Qué mide un campo de puntuación. La lista cubre lo que los protocolos piden
 * registrar; no define cómo se corrige nada, sólo cómo se llama el dato.
 */
export type ScoreFieldKind =
  | 'DIRECT'
  | 'TRANSFORMED'
  | 'ERRORS'
  | 'HITS'
  | 'OMISSIONS'
  | 'TIME'
  | 'SCALE'
  | 'OTHER'

export const scoreFieldKindLabels: Record<ScoreFieldKind, string> = {
  DIRECT: 'Puntuación directa',
  TRANSFORMED: 'Puntuación transformada',
  ERRORS: 'Errores',
  HITS: 'Aciertos',
  OMISSIONS: 'Omisiones',
  TIME: 'Tiempo',
  SCALE: 'Escala',
  OTHER: 'Otra medida',
}

/**
 * Una medida que el instrumento pide registrar.
 *
 * El formulario de resultados se construye con estas medidas y con ninguna más:
 * un campo genérico inventado por la aplicación invitaría a rellenar un dato que
 * el instrumento no contempla. `source` distingue lo que salió de la
 * estructuración del documento de lo que declaró el profesional.
 */
export type BlueprintMeasure = {
  id: string
  label: string
  kind: ScoreFieldKind
  subtestId: string | null
  unit: string
  source: 'BLUEPRINT' | 'PROFESSIONAL'
}

/**
 * Un tramo de baremo: qué puntuación transformada, percentil y clasificación
 * corresponden a un rango de puntuación directa.
 *
 * Nadie lo extrae automáticamente de la hoja de cálculo: el archivo de normas
 * puede tener cualquier forma, y adivinar una tabla numérica mal es un baremo
 * inventado con apariencia de dato leído. Un profesional lo transcribe del
 * material original y lo confirma; hasta entonces el baremo no existe para el
 * motor de cálculo.
 */
export type BaremoBand = {
  id: string
  min: number | null
  max: number | null
  /** Puntuación transformada o escalar de este tramo, si el baremo la declara. */
  scaledValue: number | null
  /** Percentil representativo del tramo, si el baremo lo declara. */
  percentile: number | null
  /** Clasificación cualitativa del tramo (p. ej. «Adecuado», «Riesgo»). */
  classification: string
}

export type InstrumentBaremo = {
  id: string
  /** `BlueprintMeasure.id` de la puntuación directa que se busca en la tabla. */
  sourceMeasureId: string
  /** Población, edad o condición para la que vale este baremo. */
  scope: string
  bands: BaremoBand[]
  /** Quién transcribió los tramos desde el material original y cuándo. */
  confirmedBy: string | null
  confirmedAt: string | null
}

export type InstrumentBlueprint = {
  id: string
  sourceJobId: string
  name: string
  shortName: string
  version: string
  authors: string[]
  instrumentType: string
  administrationType: string
  requiredFields: string[]
  /** Medidas que el instrumento pide registrar. Vacío hasta que se declaren. */
  measures: BlueprintMeasure[]
  /** Baremos confirmados por un profesional. Vacío hasta que se transcriba alguno. */
  baremos: InstrumentBaremo[]
  semanticMappings: Record<string, string>
  status: InstrumentBlueprintStatus
  approvedBy?: string | null
  approvedAt?: string | null
  automationLevel: AutomationLevel
  reviewNotes: string[]
  sourceDocuments: string[]
  licenseStatus: 'UNKNOWN' | 'AUTHORIZED' | 'RESTRICTED' | 'EXPIRED' | 'INTERNAL'
  createdAt: string
  updatedAt: string
}

// ------------------------------------------- 6. Centro de evaluación instrumental

/**
 * Cómo se registró la aplicación de un instrumento.
 *
 * No todo instrumento es un cuestionario web. Una batería real mezcla pruebas
 * que se aplican en pantalla, pruebas que se aplican con material físico y
 * resultados que ya existen en papel o en una hoja de cálculo. Las tres son
 * aplicaciones legítimas y las tres tienen que poder registrarse igual de bien.
 */
export type ApplicationMode = 'DIGITAL' | 'MANUAL' | 'IMPORTED'

export const applicationModeLabels: Record<ApplicationMode, string> = {
  DIGITAL: 'Aplicación digital',
  MANUAL: 'Aplicación manual',
  IMPORTED: 'Aplicación importada',
}

export type SessionStatus = 'PENDING' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED'

export const sessionStatusLabels: Record<SessionStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  PAUSED: 'En pausa',
  COMPLETED: 'Finalizado',
}

/**
 * Eventos de reloj de una aplicación.
 *
 * La duración no se guarda como un número que alguien incrementa: se deriva de
 * estos eventos. Un contador guardado depende de que el navegador siga vivo, y
 * al recargar la página se pierde o se duplica. Con el registro de eventos, la
 * duración se recalcula igual en cualquier momento y desde cualquier pantalla.
 */
export type SessionEventKind = 'START' | 'PAUSE' | 'RESUME' | 'END'

export type SessionEvent = {
  id: string
  kind: SessionEventKind
  at: string
  /** Quién ejecutó la acción; el reloj es parte de la trazabilidad. */
  professionalId: string
}

/** Qué se registra durante la aplicación, además del tiempo. */
export type SessionLogKind = 'OBSERVATION' | 'INCIDENT' | 'BEHAVIOUR' | 'INTERRUPTION' | 'SUPPORT' | 'NOTE'

export const sessionLogLabels: Record<SessionLogKind, string> = {
  OBSERVATION: 'Observación',
  INCIDENT: 'Incidencia',
  BEHAVIOUR: 'Conducta observada',
  INTERRUPTION: 'Interrupción',
  SUPPORT: 'Ayuda proporcionada',
  NOTE: 'Nota profesional',
}

export type SessionLogEntry = {
  id: string
  kind: SessionLogKind
  at: string
  note: string
  /** Subtest en curso cuando se registró, si lo había. */
  subtestId: string | null
  professionalId: string
}

/** Ejecución de un subtest dentro de una aplicación. */
export type SubtestRun = {
  subtestId: string
  label: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  startedAt: string | null
  completedAt: string | null
  durationMs: number
  observations: string
}

/**
 * Una medida registrada. El identificador del campo lo define el blueprint del
 * instrumento, no esta aplicación: aquí no hay campos genéricos inventados.
 */
export type ScoreValue = {
  fieldId: string
  value: string
  updatedAt: string
}

export type NarrativeStatus = 'EMPTY' | 'AI_DRAFT' | 'EDITED' | 'APPROVED'

/**
 * Un texto del instrumento con su procedencia. Resultado, interpretación y
 * conclusión son tres cosas distintas y se guardan por separado; mezclarlas es
 * lo que convierte un cálculo en un dictamen.
 */
export type InstrumentNarrative = {
  text: string
  status: NarrativeStatus
  updatedAt: string | null
  approvedAt: string | null
}

export type OrientationStatus = 'AI_DRAFT' | 'EDITED' | 'ACCEPTED' | 'DISCARDED'

export type InstrumentOrientation = {
  id: string
  text: string
  status: OrientationStatus
  /** Destinatario dentro de los grupos de recomendación del expediente. */
  group: RecommendationGroupId | null
  createdAt: string
}

/**
 * Firma profesional congelada en el momento de aprobar. Si el perfil cambia
 * después, el informe ya emitido conserva con qué credenciales se firmó.
 */
export type ProfessionalSnapshot = {
  professionalId: string
  name: string
  title: string
  registrationType: string
  registrationNumber: string
  registrationAuthority: string
}

export type InstrumentReportStatus = 'NOT_READY' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED'

export type InstrumentReportState = {
  status: InstrumentReportStatus
  generatedAt: string | null
  approvedAt: string | null
  signature: ProfessionalSnapshot | null
}

export type BackupDocumentType = 'ANSWER_SHEET' | 'SCAN' | 'PHOTO' | 'SPREADSHEET' | 'DOCUMENT' | 'OTHER'

export const backupDocumentLabels: Record<BackupDocumentType, string> = {
  ANSWER_SHEET: 'Hoja de respuestas',
  SCAN: 'Escaneo',
  PHOTO: 'Fotografía',
  SPREADSHEET: 'Hoja de cálculo',
  DOCUMENT: 'Documento',
  OTHER: 'Otro',
}

/**
 * Metadatos de un respaldo. El archivo en sí no vive aquí: el expediente guarda
 * la referencia y el contenido se almacena aparte, para que un expediente con
 * escaneos no reviente el almacén ni viaje entero en cada lectura.
 */
export type BackupDocument = {
  id: string
  evaluationId: string
  evaluationInstrumentId: string | null
  documentType: BackupDocumentType
  name: string
  mime: string
  size: number
  /** Páginas cuando el formato permite contarlas sin abrir el archivo. */
  pages: number | null
  checksum: string
  uploadedBy: string
  uploadedAt: string
}

/**
 * Un instrumento dentro de la batería del caso.
 *
 * Es la unidad de trabajo del paso 6: qué se aplicó, quién lo aplicó, cuándo,
 * cuánto duró, cómo, qué se observó, qué respaldos tiene y qué produjo. Una
 * batería es una lista ordenada de estas unidades, no un instrumento con partes.
 */
export type EvaluationInstrument = {
  id: string
  /** Instrumento del catálogo, o el blueprint que lo incorporó. */
  instrumentId: string
  blueprintId: string | null
  /** Nombre en el momento de incorporarlo, para que la batería siempre se lea. */
  name: string
  subtitle: string
  order: number
  applicationMode: ApplicationMode
  status: SessionStatus
  professionalId: string
  professionalName: string
  /** Lugar o condiciones de aplicación, cuando corresponde registrarlas. */
  location: string
  /**
   * Áreas funcionales del expediente que este instrumento informa.
   *
   * Lo declara el profesional. Un instrumento del catálogo trae sus áreas
   * escritas, pero uno incorporado desde un documento no: sin esta declaración
   * sus resultados no podrían cruzarse con nada y quedarían fuera de la matriz
   * de evidencia, que es donde sirven.
   */
  linkedAreas: FunctionalAreaId[]
  events: SessionEvent[]
  log: SessionLogEntry[]
  subtestRuns: SubtestRun[]
  scores: Record<string, ScoreValue>
  backupIds: string[]
  interpretation: InstrumentNarrative
  conclusion: InstrumentNarrative
  orientations: InstrumentOrientation[]
  report: InstrumentReportState
  createdAt: string
  updatedAt: string
}

// -------------------------------------------- 7 y 8. Conclusiones y recomendaciones

/** Cada conclusión y cada recomendación se guarda por separado. */
export type TextEntryStatus =
  | 'AI_DRAFT'
  | 'PROFESSIONAL_EDIT'
  | 'ACCEPTED'
  | 'EDITED_ACCEPTED'
  | 'DISCARDED'
  | 'STALE'

export type TextEntrySource = 'MANUAL' | 'AI' | 'AI_ASSISTED'

export type TextEntry = {
  id: string
  text: string
  createdAt: string
  title?: string
  source?: TextEntrySource
  status?: TextEntryStatus
  evidenceRefs?: string[]
  evidenceVersion?: string
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  needsReview?: boolean
  originalAiText?: string
  acceptedAt?: string
  acceptedBy?: string
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
  instrumentIngestionJobs: InstrumentIngestionJob[]
  instrumentBlueprints: Record<string, InstrumentBlueprint>
  /** Batería del caso: los instrumentos que se aplican, en orden. */
  battery: EvaluationInstrument[]
  /** Material incorporado y analizado, con su procedencia y su revisión. */
  instrumentPackages: InstrumentPackage[]
  /** Respaldos del expediente. Sólo metadatos; el archivo se guarda aparte. */
  backups: BackupDocument[]
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

export function createInstrumentIngestionJob(input: {
  evaluationId: string
  fileName: string
  fileType: string
  fileSize: number
  createdBy: string
}): InstrumentIngestionJob {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    evaluationId: input.evaluationId,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    status: 'UPLOADED',
    progress: 12,
    currentStage: 'Archivo recibido',
    startedAt: now,
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    aiProvider: 'gemini',
    aiModel: 'gemini-3.8-flash',
    blueprintId: null,
    createdBy: input.createdBy,
  }
}

export function createInstrumentBlueprint(input: {
  sourceJobId: string
  name: string
  shortName: string
  version: string
  authors?: string[]
  requiredFields?: string[]
  measures?: BlueprintMeasure[]
  sourceDocument: string
}): InstrumentBlueprint {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    sourceJobId: input.sourceJobId,
    name: input.name,
    shortName: input.shortName,
    version: input.version,
    authors: input.authors ?? [],
    instrumentType: 'No determinado',
    administrationType: 'Revisión profesional',
    requiredFields: input.requiredFields ?? [],
    measures: input.measures ?? [],
    baremos: [],
    semanticMappings: {},
    status: 'REQUIRES_REVIEW',
    approvedBy: null,
    approvedAt: null,
    automationLevel: 'WITH_REVIEW',
    reviewNotes: ['Blueprint generado por IA: requiere validación profesional antes de scoring automático.'],
    sourceDocuments: [input.sourceDocument],
    licenseStatus: 'UNKNOWN',
    createdAt: now,
    updatedAt: now,
  }
}

/** Una entrada de batería recién incorporada: sin reloj y sin resultados. */
export function createEvaluationInstrument(input: {
  instrumentId: string
  name: string
  subtitle?: string
  blueprintId?: string | null
  order: number
  applicationMode: ApplicationMode
  professionalId: string
  professionalName: string
  subtests?: Array<{ id: string; label: string }>
  linkedAreas?: FunctionalAreaId[]
}): EvaluationInstrument {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    instrumentId: input.instrumentId,
    blueprintId: input.blueprintId ?? null,
    name: input.name,
    subtitle: input.subtitle ?? '',
    order: input.order,
    applicationMode: input.applicationMode,
    status: 'PENDING',
    professionalId: input.professionalId,
    professionalName: input.professionalName,
    location: '',
    linkedAreas: input.linkedAreas ?? [],
    events: [],
    log: [],
    subtestRuns: (input.subtests ?? []).map((subtest) => ({
      subtestId: subtest.id,
      label: subtest.label,
      status: 'PENDING' as const,
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      observations: '',
    })),
    scores: {},
    backupIds: [],
    interpretation: emptyNarrative(),
    conclusion: emptyNarrative(),
    orientations: [],
    report: { status: 'NOT_READY', generatedAt: null, approvedAt: null, signature: null },
    createdAt: now,
    updatedAt: now,
  }
}

export function emptyNarrative(): InstrumentNarrative {
  return { text: '', status: 'EMPTY', updatedAt: null, approvedAt: null }
}

export function createSessionEvent(kind: SessionEventKind, professionalId: string): SessionEvent {
  return { id: crypto.randomUUID(), kind, at: new Date().toISOString(), professionalId }
}

export function createSessionLogEntry(input: {
  kind: SessionLogKind
  note: string
  subtestId?: string | null
  professionalId: string
}): SessionLogEntry {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    at: new Date().toISOString(),
    note: input.note,
    subtestId: input.subtestId ?? null,
    professionalId: input.professionalId,
  }
}

export function emptySubtestEntry(): SubtestEntry {
  return { pd: '', pt: '', observations: '', updatedAt: '' }
}

export function newTextEntry(text = '', metadata: Partial<Omit<TextEntry, 'id' | 'text' | 'createdAt'>> = {}): TextEntry {
  return { id: crypto.randomUUID(), text, createdAt: new Date().toISOString(), ...metadata }
}

export function newIntervention(): Intervention {
  return { id: crypto.randomUUID(), institution: '', specialty: '', documentType: '', result: '', year: '' }
}
