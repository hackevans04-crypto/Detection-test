/**
 * Modelo del paquete de instrumento.
 *
 * Un instrumento no es un archivo. Lo habitual es que llegue repartido: el
 * manual en un PDF, el cuadernillo en otro, la hoja de respuestas en un tercero
 * y una hoja de cálculo que alguien montó para corregir. A veces todo eso viene
 * en un ZIP, a veces en una carpeta, y a veces el profesional lo va subiendo a
 * lo largo de varios días.
 *
 * El paquete es la unidad que mantiene todo eso junto y sabe de dónde salió
 * cada dato. Sin esa procedencia el análisis no se puede revisar, y un
 * instrumento que no se puede revisar no se puede usar.
 */

export type PackageFileRole =
  | 'MANUAL'
  | 'QUESTION_BOOKLET'
  | 'ANSWER_SHEET'
  | 'STIMULUS_BOOK'
  | 'SCORING_TEMPLATE'
  | 'AUTOMATED_SPREADSHEET'
  | 'NORMS'
  | 'CORRECTION_GUIDE'
  | 'INSTRUCTIONS'
  | 'REPORT_TEMPLATE'
  | 'EXAMPLE'
  | 'IMAGE'
  | 'SUPPORT'
  | 'SUPPORT_DOCUMENT'
  | 'UNKNOWN'

export const packageFileRoleLabels: Record<PackageFileRole, string> = {
  MANUAL: 'Manual',
  QUESTION_BOOKLET: 'Cuadernillo',
  ANSWER_SHEET: 'Hoja de respuestas',
  STIMULUS_BOOK: 'Cuaderno de estímulos',
  SCORING_TEMPLATE: 'Plantilla de corrección',
  AUTOMATED_SPREADSHEET: 'Hoja de cálculo',
  NORMS: 'Baremos',
  CORRECTION_GUIDE: 'Guía de corrección',
  INSTRUCTIONS: 'Instrucciones',
  REPORT_TEMPLATE: 'Plantilla de informe',
  EXAMPLE: 'Ejemplo',
  IMAGE: 'Imagen',
  SUPPORT: 'Apoyo',
  SUPPORT_DOCUMENT: 'Documento de apoyo',
  UNKNOWN: 'Sin clasificar',
}

/** Qué se pudo hacer con el archivo, más allá de qué es. */
export type PackageFileStatus = 'ACCEPTED' | 'IGNORED' | 'REJECTED'

export type PackageFile = {
  id: string
  /** Ruta dentro del paquete: conserva la estructura de carpetas del origen. */
  path: string
  name: string
  extension: string
  /** Tipo declarado por el navegador; no se confía en él por sí solo. */
  declaredMime: string
  /** Tipo deducido de los primeros bytes del archivo. */
  detectedMime: string | null
  size: number
  checksum: string
  role: PackageFileRole
  /** 0..1. Con qué seguridad se asignó el rol. */
  confidence: number
  /** Qué llevó a esa clasificación, en lenguaje revisable. */
  evidence: string[]
  status: PackageFileStatus
  /** Por qué se ignoró o rechazó. Vacío cuando se aceptó. */
  reason: string
  /** Archivo comprimido del que salió, si salió de uno. */
  extractedFrom: string | null
}

/**
 * De dónde salió un dato del blueprint.
 *
 * Sin esto, revisar el análisis obliga a volver a leerse el manual entero. Con
 * esto, cada afirmación del instrumento apunta a su archivo y, cuando se puede
 * determinar, a su página, hoja o celda.
 */
export type SourceReference = {
  fileId: string
  fileName: string
  /** Página de un PDF, hoja de un libro de cálculo, o nada si no se determina. */
  locator: string | null
  confidence: number
}

export type PackageFinding = {
  id: string
  /** Qué se afirma: «Edad de aplicación», «Número de ítems»… */
  field: string
  value: string
  sources: SourceReference[]
}

export type ImportedComputedResult = {
  measureId: string
  label: string
  rawValue: string | null
  transformedValue: string | null
  percentile: number | null
  classification: string | null
  sourceFile: string
  sourceLocation: string | null
  confidence: number
}

export type CompletedResponseStatus = 'BLANK_FORM' | 'COMPLETED_RESPONSE' | 'COMPUTED_RESULT' | 'SCORING_TEMPLATE' | 'UNKNOWN'

export type WorkbookSemanticKind =
  | 'BLANK_SCORING_TEMPLATE'
  | 'COMPLETED_APPLICATION'
  | 'COMPUTED_RESULTS'
  | 'NORM_TABLE'
  | 'SCORING_ENGINE'
  | 'UNKNOWN'

export type WorkbookSemanticSummary = {
  fileId: string
  fileName: string
  readable: boolean
  reason: string
  semanticKind: WorkbookSemanticKind
  sheetsInspected: number
  sheetNames: string[]
  usedRanges: string[]
  formulaCells: number
  valueCells: number
  inputRanges: string[]
  outputRanges: string[]
  detectedScales: string[]
  currentInputCoverage: number
  hasMacros: boolean
  hiddenSheets: string[]
  namedRanges: string[]
  mergedRanges: number
  dataValidationRules: number
  evidence: string[]
}

export type PipelineCapabilities = {
  canIdentify: boolean
  canDigitalizeDefinition: boolean
  hasApplication: boolean
  canExtractResponses: boolean
  hasImportedResults: boolean
  canScoreRaw: boolean
  canScoreNormatively: boolean
  canShowResults: boolean
  canGenerateCharts: boolean
  canGenerateInterpretation: boolean
  canGenerateReport: boolean
  canExportToStep7: boolean
}

export type PipelineDiagnostic = {
  pipelineVersion: string
  archive: {
    ok: boolean
    name: string | null
    internalFiles: number
  }
  workbooksFound: number
  workbooksInspected: number
  documentsFound: number
  imagesFound: number
  applicationCandidates: number
  completedApplicationCandidates: number
  responseCandidates: number
  validatedResponses: number
  importedResults: number
  capabilities: PipelineCapabilities
  workbookAnalyses: WorkbookSemanticSummary[]
  fileRoles: Array<{
    fileId: string
    fileName: string
    role: PackageFileRole
    confidence: number
    status: PackageFileStatus
    evidence: string[]
  }>
  limitations: string[]
  elapsedMs: number
}

export type CompletedResponseCandidate = {
  fileId: string
  instrumentId: string | null
  status: CompletedResponseStatus
  responseCount: number
  completeness: number
  confidence: number
  evidence: string[]
}

export type ExtractedResponseStatus = 'EXTRACTED' | 'AMBIGUOUS' | 'MISSING' | 'INVALID'

export type ExtractedResponse = {
  itemId: string
  rawValue: string
  normalizedValue: string
  sourceFile: string
  sourceLocation: string | null
  confidence: number
  status: ExtractedResponseStatus
}

export type ExtractedResponseSet = {
  instrumentId: string | null
  sourceFiles: string[]
  totalItemsExpected: number | null
  totalItemsExtracted: number
  completionRate: number
  responses: ExtractedResponse[]
  warnings: string[]
}

export type ConsistencyState = 'MATCH' | 'CONFLICT' | 'PARTIAL' | 'ABSENT'

export const consistencyLabels: Record<ConsistencyState, string> = {
  MATCH: 'Coincidente',
  CONFLICT: 'Conflicto',
  PARTIAL: 'Requiere validación',
  ABSENT: 'No encontrado',
}

/**
 * Una fila de la matriz de consistencia: qué dice cada archivo sobre el mismo
 * dato. Es la comprobación que convierte cuatro lecturas sueltas en una
 * afirmación defendible, y la que detecta que el manual y el Excel no cuadran.
 */
export type ConsistencyRow = {
  field: string
  readings: Array<{ fileId: string; fileName: string; value: string }>
  state: ConsistencyState
  detail: string
}

export type PackageStage =
  | 'UPLOAD'
  | 'SECURITY_SCAN'
  | 'ARCHIVE_EXTRACTION'
  | 'FILE_CLASSIFICATION'
  | 'DOCUMENT_ANALYSIS'
  | 'SPREADSHEET_ANALYSIS'
  | 'CROSS_VALIDATION'
  | 'BLUEPRINT_GENERATION'
  | 'REVIEW'

export const packageStageLabels: Record<PackageStage, string> = {
  UPLOAD: 'Archivo recibido',
  SECURITY_SCAN: 'Materiales identificados',
  ARCHIVE_EXTRACTION: 'Instrumento reconocido',
  FILE_CLASSIFICATION: 'Instrumento reconocido',
  DOCUMENT_ANALYSIS: 'Estructura analizada',
  SPREADSHEET_ANALYSIS: 'Analizando corrección',
  CROSS_VALIDATION: 'Datos vinculados',
  BLUEPRINT_GENERATION: 'Preparado para procesamiento',
  REVIEW: 'Resultados',
}

export const packageStages: PackageStage[] = [
  'UPLOAD',
  'SECURITY_SCAN',
  'ARCHIVE_EXTRACTION',
  'FILE_CLASSIFICATION',
  'DOCUMENT_ANALYSIS',
  'SPREADSHEET_ANALYSIS',
  'CROSS_VALIDATION',
  'BLUEPRINT_GENERATION',
  'REVIEW',
]

/**
 * Hasta dónde llegó la estructuración. Un paquete puede quedarse a medias sin
 * que eso sea un fallo: material de respaldo bien guardado ya vale, y decirlo
 * es mejor que fingir que todo quedó automatizado.
 */
export type PackageReadiness =
  | 'READY'
  | 'PARTIAL_READY'
  | 'INSUFFICIENT_DATA'
  | 'REQUIRES_REVIEW'
  | 'PARTIALLY_STRUCTURED'
  | 'SUPPORT_MATERIAL_ONLY'
  | 'FAILED'

export const packageReadinessLabels: Record<PackageReadiness, string> = {
  READY: 'Listo para uso',
  PARTIAL_READY: 'Análisis parcial disponible',
  INSUFFICIENT_DATA: 'Datos insuficientes',
  REQUIRES_REVIEW: 'Revisión requerida',
  PARTIALLY_STRUCTURED: 'Parcialmente estructurado',
  SUPPORT_MATERIAL_ONLY: 'Sólo material de respaldo',
  FAILED: 'Procesamiento detenido',
}

/** Bloques que el panel de revisión valida por separado. */
export type ReviewBlockId =
  | 'general'
  | 'aplicacion'
  | 'items'
  | 'respuestas'
  | 'escalas'
  | 'calculo'
  | 'baremos'
  | 'resultados'
  | 'graficos'
  | 'informe'
  | 'fuentes'

export const reviewBlockLabels: Record<ReviewBlockId, string> = {
  general: 'General',
  aplicacion: 'Aplicación',
  items: 'Ítems',
  respuestas: 'Respuestas',
  escalas: 'Escalas',
  calculo: 'Cálculo',
  baremos: 'Baremos',
  resultados: 'Resultados',
  graficos: 'Gráficos',
  informe: 'Informe',
  fuentes: 'Fuentes',
}

export type ReviewBlockState = 'OK' | 'REVIEW' | 'MISSING'

export type ReviewBlock = {
  id: ReviewBlockId
  label: string
  state: ReviewBlockState
  /** Lo que se pudo determinar en este bloque, con su procedencia. */
  findings: PackageFinding[]
  notes: string[]
  approved: boolean
}

export type InstrumentPackage = {
  id: string
  evaluationId: string
  /** Nombre del instrumento, cuando se pudo determinar. Nunca el del archivo. */
  name: string | null
  instrumentIdentity: PackageFingerprint
  originalArchive: {
    fileId: string
    name: string
    size: number
    checksum: string
  } | null
  /** Huella para reconocer que material nuevo pertenece a este paquete. */
  fingerprint: PackageFingerprint
  files: PackageFile[]
  findings: PackageFinding[]
  computedResults: ImportedComputedResult[]
  responseCandidates: CompletedResponseCandidate[]
  extractedResponses: ExtractedResponseSet[]
  diagnostics?: PipelineDiagnostic
  consistency: ConsistencyRow[]
  blocks: ReviewBlock[]
  stage: PackageStage
  readiness: PackageReadiness
  /** Motivo de un procesamiento detenido. Vacío en el resto de casos. */
  errorMessage: string
  blueprintId: string | null
  blueprintVersion: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/**
 * Huella de identidad del instrumento.
 *
 * Sirve para responder a una pregunta muy concreta: el archivo que acaban de
 * subir, ¿es material del instrumento que ya está aquí o es otro instrumento?
 * Sin ella, subir el manual y la hoja de respuestas por separado crearía dos
 * instrumentos distintos con la mitad del material cada uno.
 */
export type PackageFingerprint = {
  /** Nombre normalizado, sin acentos ni ruido de nombre de archivo. */
  normalizedName: string | null
  acronym: string | null
  authors: string[]
  version: string | null
  itemCount: number | null
  scales: string[]
  /** Checksums de todo lo incorporado, para detectar el mismo archivo dos veces. */
  checksums: string[]
}

export function emptyFingerprint(): PackageFingerprint {
  return {
    normalizedName: null,
    acronym: null,
    authors: [],
    version: null,
    itemCount: null,
    scales: [],
    checksums: [],
  }
}

export function createInstrumentPackage(input: {
  evaluationId: string
  createdBy: string
}): InstrumentPackage {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    evaluationId: input.evaluationId,
    name: null,
    instrumentIdentity: emptyFingerprint(),
    originalArchive: null,
    fingerprint: emptyFingerprint(),
    files: [],
    findings: [],
    computedResults: [],
    responseCandidates: [],
    extractedResponses: [],
    consistency: [],
    blocks: [],
    stage: 'UPLOAD',
    readiness: 'REQUIRES_REVIEW',
    errorMessage: '',
    blueprintId: null,
    blueprintVersion: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
}

/** Materiales realmente incorporados, sin los ignorados ni los rechazados. */
export function acceptedFiles(pkg: InstrumentPackage) {
  return pkg.files.filter((file) => file.status === 'ACCEPTED')
}

export function filesByRole(pkg: InstrumentPackage, role: PackageFileRole) {
  return acceptedFiles(pkg).filter((file) => file.role === role)
}
