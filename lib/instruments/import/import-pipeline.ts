import { extractRecursively } from '@/lib/instruments/import/archive-extractor'
import { buildConsistencyMatrix, buildFindings, materialCoverage, type Reading } from '@/lib/instruments/import/cross-validation'
import { classifyFile } from '@/lib/instruments/import/file-classifier'
import { checksumOf, extensionOf, inspectFile, type FileKind } from '@/lib/instruments/import/file-safety'
import { extractComputedResultsFromSpreadsheet } from '@/lib/instruments/import/computed-results'
import { detectCompletedResponses } from '@/lib/instruments/import/completed-response-detector'
import { extractResponses } from '@/lib/instruments/import/response-extraction-engine'
import { acronymOf, normalizeName, resolveInstrumentIdentity } from '@/lib/instruments/import/identity-resolver'
import {
  createInstrumentPackage,
  packageStages,
  reviewBlockLabels,
  type InstrumentPackage,
  type PackageFile,
  type PackageFileRole,
  type PackageFinding,
  type PipelineCapabilities,
  type PackageReadiness,
  type PackageStage,
  type ReviewBlock,
  type ReviewBlockId,
  type ReviewBlockState,
  type WorkbookSemanticSummary,
} from '@/lib/instruments/import/package-model'
import { analyzeSpreadsheet, type SpreadsheetAnalysis } from '@/lib/instruments/import/spreadsheet-analyzer'
import {
  createInstrumentBlueprint,
  type AutomationLevel,
  type BlueprintMeasure,
  type InstrumentBlueprint,
} from '@/lib/evaluations/model'
import { classifyInstrumentWithGemini, hasGeminiKey } from '@/lib/ai/gemini'

/**
 * Procesamiento de un paquete de instrumento, de extremo a extremo.
 *
 * El profesional entrega el material que tiene —un archivo, varios, una carpeta
 * o un comprimido— y aquí se decide qué es cada cosa, cómo se relacionan y
 * cuánto se puede estructurar. Todo ocurre en el servidor: abrir un comprimido
 * subido por alguien no es trabajo del navegador.
 *
 * Cada etapa deja su rastro en el paquete, así que recargar la página no
 * interrumpe nada ni obliga a repetir el análisis: lo que se ve es el estado
 * guardado.
 *
 * La regla que atraviesa todo el archivo: no inventar. Un dato que no está en
 * el material no aparece, y un paquete que sólo da para respaldo se declara así
 * en lugar de dejarse en verde.
 */

export type IncomingFile = {
  /** Ruta relativa cuando viene de una carpeta; si no, el nombre. */
  path: string
  declaredMime: string
  bytes: Uint8Array
}

export type PipelineResult = {
  pkg: InstrumentPackage
  blueprint: InstrumentBlueprint | null
  /** Avisos del procesamiento en lenguaje del profesional. */
  notices: string[]
}

const archiveKinds: FileKind[] = ['zip', 'rar']

/** Convierte lo entregado en la lista real de materiales, abriendo comprimidos. */
async function collectFiles(incoming: IncomingFile[]): Promise<{
  files: PackageFile[]
  sources: IncomingFile[]
  notices: string[]
  workbookAnalyses: WorkbookSemanticSummary[]
}> {
  const files: PackageFile[] = []
  const sources: IncomingFile[] = []
  const notices: string[] = []
  const workbookAnalyses: WorkbookSemanticSummary[] = []

  const push = async (input: IncomingFile, extractedFrom: string | null) => {
    const verdict = inspectFile({
      path: input.path,
      size: input.bytes.length,
      declaredMime: input.declaredMime,
      head: input.bytes.subarray(0, 32),
    })

    const base = {
      id: crypto.randomUUID(),
      path: input.path,
      name: input.path.split('/').pop() ?? input.path,
      extension: extensionOf(input.path),
      declaredMime: input.declaredMime,
      detectedMime: verdict.detectedMime,
      size: input.bytes.length,
      checksum: await checksumOf(input.bytes),
      extractedFrom,
    }

    if (!verdict.ok) {
      // El ruido del sistema se ignora en silencio; lo rechazado se dice.
      if (!verdict.ignorable) {
        notices.push(`${base.name}: ${verdict.reason}`)
      }
      files.push({
        ...base,
        role: 'UNKNOWN',
        confidence: 0,
        evidence: [],
        status: verdict.ignorable ? 'IGNORED' : 'REJECTED',
        reason: verdict.reason,
      })
      return
    }

    if (archiveKinds.includes(verdict.kind)) {
      try {
        const extracted = await extractRecursively(input.bytes, verdict.kind as 'zip' | 'rar')
        for (const entry of extracted.entries) {
          await push(
            { path: `${base.name}/${entry.path}`, declaredMime: '', bytes: entry.bytes },
            base.id,
          )
        }
        for (const skipped of extracted.skipped) {
          notices.push(`${skipped.path}: ${skipped.reason}`)
        }
        if (extracted.truncated) {
          notices.push('El paquete contenía más material del que se puede procesar; se abrió una parte.')
        }
      } catch (error) {
        notices.push(error instanceof Error ? error.message : 'No se pudo abrir el paquete comprimido.')
        files.push({
          ...base,
          role: 'UNKNOWN',
          confidence: 0,
          evidence: [],
          status: 'REJECTED',
          reason: 'No se pudo abrir el paquete comprimido.',
        })
      }
      return
    }

    sources.push(input)

    const analysis =
      verdict.kind === 'spreadsheet' ? await analyzeSpreadsheet(input.bytes, base.name) : null

    const classification = classifyFile({
      path: input.path,
      kind: verdict.kind,
      size: input.bytes.length,
      text: verdict.kind === 'pdf' ? extractPdfText(input.bytes) : undefined,
      sheetNames: analysis?.sheets.map((sheet) => sheet.name),
    })

    const file: PackageFile = {
      ...base,
      role: classification.role,
      confidence: classification.confidence,
      evidence: [...classification.evidence, ...(analysis?.semanticEvidence ?? []), ...verdict.warnings],
      status: 'ACCEPTED',
      reason: '',
    }
    files.push(file)
    if (analysis) workbookAnalyses.push(toWorkbookSummary(file, analysis))
  }

  for (const input of incoming) {
    await push(input, null)
  }

  return { files, sources, notices, workbookAnalyses }
}

function toWorkbookSummary(file: PackageFile, analysis: SpreadsheetAnalysis): WorkbookSemanticSummary {
  return {
    fileId: file.id,
    fileName: file.name,
    readable: analysis.readable,
    reason: analysis.reason,
    semanticKind: analysis.semanticKind,
    sheetsInspected: analysis.sheets.length,
    sheetNames: analysis.sheets.map((sheet) => sheet.name),
    usedRanges: analysis.sheets.map((sheet) => sheet.usedRange).filter((range): range is string => Boolean(range)),
    formulaCells: analysis.sheets.reduce((sum, sheet) => sum + sheet.formulaCells, 0),
    valueCells: analysis.sheets.reduce((sum, sheet) => sum + sheet.valueCells, 0),
    inputRanges: analysis.inputRanges,
    outputRanges: analysis.outputRanges,
    detectedScales: analysis.detectedScales,
    currentInputCoverage: analysis.currentInputCoverage,
    hasMacros: analysis.hasMacros,
    hiddenSheets: analysis.hiddenSheets,
    namedRanges: analysis.namedRanges,
    mergedRanges: analysis.mergedRanges,
    dataValidationRules: analysis.dataValidationRules,
    evidence: analysis.semanticEvidence,
  }
}

/**
 * Texto legible de un PDF, sin descomprimir sus flujos.
 *
 * Sirve para las señales de clasificación —encabezados, portadas, campos— y no
 * pretende ser una extracción completa: un PDF con todo el texto comprimido
 * devolverá poco, y en ese caso la clasificación se apoya en el nombre y el
 * profesional confirma. Prefiere quedarse corto a inventar contenido.
 */
function extractPdfText(bytes: Uint8Array): string {
  const slice = bytes.subarray(0, Math.min(bytes.length, 512 * 1024))
  const raw = new TextDecoder('latin1').decode(slice)
  const chunks: string[] = []
  const pattern = /\(([^()\\]{3,200})\)\s*Tj/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null && chunks.length < 400) {
    chunks.push(match[1])
  }
  return chunks.join(' ')
}

/** Lecturas que el material declara y que se pueden contrastar entre archivos. */
async function readAcrossFiles(files: PackageFile[], incoming: IncomingFile[]): Promise<Reading[]> {
  const readings: Reading[] = []

  for (const file of files) {
    if (file.status !== 'ACCEPTED') continue
    const source = incoming.find((item) => item.path === file.path)
    if (!source) continue

    if (file.role === 'AUTOMATED_SPREADSHEET' || file.role === 'SCORING_TEMPLATE' || file.role === 'NORMS') {
      const analysis = await analyzeSpreadsheet(source.bytes, file.name)
      if (!analysis.readable) continue

      const inputSheet = analysis.sheets.find((sheet) => sheet.probableUse === 'INPUT')
      if (inputSheet && inputSheet.valueCells > 0) {
        readings.push({
          fileId: file.id,
          fileName: file.name,
          field: 'itemCount',
          value: String(inputSheet.valueCells),
          confidence: 0.5,
          locator: `Hoja «${inputSheet.name}»`,
        })
      }
    }
  }

  return readings
}

function stateOf(condition: boolean, partial = false): ReviewBlockState {
  if (condition) return partial ? 'REVIEW' : 'OK'
  return 'MISSING'
}

/**
 * Bloques del panel de revisión. Cada uno se valida por separado porque cada uno
 * se comprueba con material distinto: la estructura se ve en el cuadernillo, el
 * cálculo en la hoja, los baremos en el manual.
 */
function buildBlocks(pkg: InstrumentPackage, findings: PackageFinding[]): ReviewBlock[] {
  const coverage = materialCoverage(pkg.files)

  const definitions: Array<{ id: ReviewBlockId; state: ReviewBlockState; notes: string[] }> = [
    {
      id: 'general',
      state: stateOf(pkg.files.some((file) => file.status === 'ACCEPTED')),
      notes: pkg.name ? [] : ['El nombre del instrumento no se pudo determinar del material.'],
    },
    {
      id: 'aplicacion',
      state: stateOf(coverage.hasManual || coverage.hasBooklet, !coverage.hasManual),
      notes: coverage.hasManual ? [] : ['Sin manual: las condiciones de aplicación no se pudieron leer.'],
    },
    {
      id: 'items',
      state: stateOf(coverage.hasBooklet, true),
      notes: coverage.hasBooklet
        ? ['La estructura de ítems requiere confirmación profesional.']
        : ['Sin cuadernillo incorporado.'],
    },
    {
      id: 'respuestas',
      state: stateOf(coverage.hasAnswerSheet, true),
      notes: coverage.hasAnswerSheet
        ? ['Estructura de la hoja de respuestas pendiente de confirmar.']
        : ['Sin hoja de respuestas incorporada.'],
    },
    {
      id: 'escalas',
      state: stateOf(pkg.fingerprint.scales.length > 0, true),
      notes: pkg.fingerprint.scales.length > 0 ? [] : ['Las escalas no se pudieron determinar del material.'],
    },
    {
      id: 'calculo',
      state: stateOf(coverage.hasSpreadsheet, true),
      notes: coverage.hasSpreadsheet
        ? ['Reglas candidatas detectadas: requieren validación antes de usarse.']
        : ['Sin material de corrección incorporado.'],
    },
    {
      id: 'baremos',
      state: stateOf(coverage.hasNorms, true),
      notes: coverage.hasNorms
        ? ['Baremos detectados: requieren validación.']
        : ['No se identificaron baremos en el material.'],
    },
    {
      id: 'resultados',
      state: stateOf(coverage.hasSpreadsheet || coverage.hasAnswerSheet, true),
      notes: [],
    },
    {
      id: 'graficos',
      state: stateOf(pkg.fingerprint.scales.length > 0 || coverage.hasSpreadsheet, true),
      notes: ['Los gráficos se configuran con las escalas validadas.'],
    },
    {
      id: 'informe',
      state: stateOf(pkg.files.some((file) => file.role === 'REPORT_TEMPLATE'), true),
      notes: [],
    },
    {
      id: 'fuentes',
      state: stateOf(pkg.files.some((file) => file.status === 'ACCEPTED')),
      notes: [],
    },
  ]

  return definitions.map((definition) => ({
    id: definition.id,
    label: reviewBlockLabels[definition.id],
    state: definition.state,
    findings: definition.id === 'fuentes' ? findings : findings.filter(() => definition.id === 'general'),
    notes: definition.notes,
    approved: false,
  }))
}

function readinessOf(pkg: InstrumentPackage, blocks: ReviewBlock[]): PackageReadiness {
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')
  if (accepted.length === 0) return 'FAILED'

  const coverage = materialCoverage(pkg.files)
  const structural = blocks.filter((block) => ['aplicacion', 'items', 'respuestas', 'calculo'].includes(block.id))
  const missing = structural.filter((block) => block.state === 'MISSING').length
  const hasAnyScorableSource = coverage.hasAnswerSheet || coverage.hasSpreadsheet
  const hasAnyStructureSource = coverage.hasBooklet || coverage.hasSpreadsheet
  const hasInterpretationSource = coverage.hasManual || coverage.hasNorms

  // Sólo material de respaldo: queda guardado, pero no permite resolver estructura ni resultados.
  if (!coverage.hasManual && !coverage.hasBooklet && !coverage.hasAnswerSheet && !coverage.hasSpreadsheet) {
    return 'SUPPORT_MATERIAL_ONLY'
  }
  if (hasAnyScorableSource && (hasAnyStructureSource || hasInterpretationSource)) return 'PARTIAL_READY'
  if (!hasAnyScorableSource) return 'INSUFFICIENT_DATA'
  if (missing >= 3) return 'PARTIALLY_STRUCTURED'
  return 'REQUIRES_REVIEW'
}

function roleCount(files: PackageFile[], role: PackageFileRole) {
  return files.filter((file) => file.status === 'ACCEPTED' && file.role === role).length
}

function blueprintMeasures(pkg: InstrumentPackage): BlueprintMeasure[] {
  const measures: BlueprintMeasure[] = []
  const hasAnswerSheet = roleCount(pkg.files, 'ANSWER_SHEET') > 0
  const hasSpreadsheet =
    roleCount(pkg.files, 'AUTOMATED_SPREADSHEET') > 0 || roleCount(pkg.files, 'SCORING_TEMPLATE') > 0
  const hasNorms = roleCount(pkg.files, 'NORMS') > 0

  if (hasAnswerSheet || hasSpreadsheet) {
    measures.push({
      id: `${pkg.id}.direct-score`,
      label: 'Puntuación directa',
      kind: 'DIRECT',
      subtestId: null,
      unit: '',
      source: 'BLUEPRINT',
    })
  }

  if (hasNorms || hasSpreadsheet) {
    measures.push({
      id: `${pkg.id}.transformed-score`,
      label: 'Puntuación transformada',
      kind: 'TRANSFORMED',
      subtestId: null,
      unit: 'según baremo validado',
      source: 'BLUEPRINT',
    })
  }

  if (hasSpreadsheet) {
    measures.push({
      id: `${pkg.id}.classification`,
      label: 'Clasificación o rango',
      kind: 'SCALE',
      subtestId: null,
      unit: '',
      source: 'BLUEPRINT',
    })
  }

  return measures
}

function automationLevelOf(pkg: InstrumentPackage): AutomationLevel {
  const hasSpreadsheet =
    roleCount(pkg.files, 'AUTOMATED_SPREADSHEET') > 0 || roleCount(pkg.files, 'SCORING_TEMPLATE') > 0
  const hasAnswerSheet = roleCount(pkg.files, 'ANSWER_SHEET') > 0
  const hasBooklet = roleCount(pkg.files, 'QUESTION_BOOKLET') > 0 || roleCount(pkg.files, 'STIMULUS_BOOK') > 0

  if (hasSpreadsheet && hasAnswerSheet) return 'WITH_REVIEW'
  if (hasBooklet || hasAnswerSheet) return 'DIGITIZATION_ONLY'
  return 'BLOCKED'
}

function buildBlueprintCandidate(pkg: InstrumentPackage): InstrumentBlueprint | null {
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')

  if (accepted.length === 0 || pkg.readiness === 'FAILED' || pkg.readiness === 'SUPPORT_MATERIAL_ONLY') {
    return null
  }

  const hasManual = roleCount(pkg.files, 'MANUAL') > 0
  const hasAnswerSheet = roleCount(pkg.files, 'ANSWER_SHEET') > 0
  const hasSpreadsheet =
    roleCount(pkg.files, 'AUTOMATED_SPREADSHEET') > 0 || roleCount(pkg.files, 'SCORING_TEMPLATE') > 0
  const hasNorms = roleCount(pkg.files, 'NORMS') > 0

  const blueprint = createInstrumentBlueprint({
    sourceJobId: pkg.id,
    name: pkg.name ?? 'Instrumento sin identificar',
    shortName: pkg.fingerprint.acronym ?? pkg.name ?? 'Instrumento',
    version: pkg.fingerprint.version ?? 'No determinada',
    authors: pkg.fingerprint.authors,
    requiredFields: ['person.fullName', 'person.age', 'evaluation.date', 'professional.name'],
    measures: blueprintMeasures(pkg),
    sourceDocument: accepted.map((file) => file.name).join(', '),
  })

  return {
    ...blueprint,
    administrationType: hasAnswerSheet ? 'Digital, manual o importada' : 'Revisión profesional',
    automationLevel: automationLevelOf(pkg),
    reviewNotes: [
      'Blueprint candidato: requiere validación profesional antes de cálculo automático.',
      hasManual ? 'Manual detectado para revisar administración e interpretación.' : 'Falta manual para confirmar administración e interpretación.',
      hasSpreadsheet
        ? 'Hoja de cálculo detectada: fórmulas leídas como candidatas, sin ejecutar macros ni código embebido.'
        : 'Sin hoja automatizada: las reglas de corrección deben validarse desde otra fuente.',
      hasNorms ? 'Baremos detectados: validar población, edad y escala antes de interpretar.' : 'No se detectaron baremos validados.',
    ],
    sourceDocuments: accepted.map((file) => file.name),
    updatedAt: new Date().toISOString(),
  }
}

function buildPipelineCapabilities(pkg: InstrumentPackage): PipelineCapabilities {
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')
  const workbookAnalyses = pkg.diagnostics?.workbookAnalyses ?? []
  const hasDefinitionMaterial = accepted.some((file) =>
    ['MANUAL', 'QUESTION_BOOKLET', 'STIMULUS_BOOK', 'SCORING_TEMPLATE', 'AUTOMATED_SPREADSHEET', 'NORMS'].includes(file.role),
  )
  const hasApplication = pkg.responseCandidates.some((candidate) => candidate.status === 'COMPLETED_RESPONSE')
  const hasExtractedResponses = pkg.extractedResponses.some((set) =>
    set.responses.some((response) => response.status === 'EXTRACTED'),
  )
  const hasImportedResults = pkg.computedResults.length > 0
  const hasScoringEngine = accepted.some((file) => file.role === 'SCORING_TEMPLATE' || file.role === 'AUTOMATED_SPREADSHEET')
  const hasNorms = accepted.some((file) => file.role === 'NORMS') || workbookAnalyses.some((item) => item.semanticKind === 'NORM_TABLE')
  const canShowResults = hasExtractedResponses || hasImportedResults

  return {
    canIdentify: Boolean(pkg.name || pkg.fingerprint.acronym),
    canDigitalizeDefinition: hasDefinitionMaterial,
    hasApplication,
    canExtractResponses: hasApplication,
    hasImportedResults,
    canScoreRaw: hasExtractedResponses || hasImportedResults || hasScoringEngine,
    canScoreNormatively: canShowResults && hasNorms,
    canShowResults,
    canGenerateCharts: canShowResults,
    canGenerateInterpretation: canShowResults,
    canGenerateReport: canShowResults,
    canExportToStep7: accepted.length > 0,
  }
}

function buildPipelineLimitations(pkg: InstrumentPackage, notices: string[]) {
  const limitations = new Set<string>(notices)
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')
  const completedApplications = pkg.responseCandidates.filter((candidate) => candidate.status === 'COMPLETED_RESPONSE')
  const extractedResponses = pkg.extractedResponses.reduce((sum, set) => sum + set.responses.length, 0)

  if (accepted.length === 0) limitations.add('No quedó material procesable dentro del paquete.')
  if (completedApplications.length === 0) limitations.add('No se encontró una aplicación completada del evaluado.')
  if (extractedResponses === 0) limitations.add('No se extrajeron respuestas verificables; no se inventaron puntuaciones.')
  if (pkg.computedResults.length === 0) limitations.add('No se encontraron resultados calculados verificables en las hojas revisadas.')

  return [...limitations]
}

function buildPipelineDiagnostic(
  pkg: InstrumentPackage,
  workbookAnalyses: WorkbookSemanticSummary[],
  notices: string[],
  startedAt: number,
) {
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')
  const documentsFound = accepted.filter((file) => ['pdf', 'doc', 'docx', 'txt'].includes(file.extension.toLowerCase())).length
  const imagesFound = accepted.filter((file) => ['jpg', 'jpeg', 'png', 'webp'].includes(file.extension.toLowerCase())).length
  const completedApplicationCandidates = pkg.responseCandidates.filter((candidate) => candidate.status === 'COMPLETED_RESPONSE').length
  const responseCandidates = pkg.responseCandidates.filter((candidate) =>
    ['COMPLETED_RESPONSE', 'BLANK_FORM', 'COMPUTED_RESULT'].includes(candidate.status),
  ).length
  const validatedResponses = pkg.extractedResponses.reduce(
    (sum, set) => sum + set.responses.filter((response) => response.status === 'EXTRACTED').length,
    0,
  )

  const diagnostic = {
    pipelineVersion: 'instrument-ai-v3',
    archive: {
      ok: Boolean(pkg.originalArchive) || accepted.length > 0,
      name: pkg.originalArchive?.name ?? null,
      internalFiles: accepted.length,
    },
    workbooksFound: accepted.filter((file) => ['xls', 'xlsx', 'csv'].includes(file.extension.toLowerCase())).length,
    workbooksInspected: workbookAnalyses.filter((item) => item.readable).length,
    documentsFound,
    imagesFound,
    applicationCandidates: pkg.responseCandidates.filter((candidate) => candidate.status !== 'UNKNOWN').length,
    completedApplicationCandidates,
    responseCandidates,
    validatedResponses,
    importedResults: pkg.computedResults.length,
    capabilities: {} as PipelineCapabilities,
    workbookAnalyses,
    fileRoles: pkg.files.map((file) => ({
      fileId: file.id,
      fileName: file.name,
      role: file.role,
      confidence: file.confidence,
      status: file.status,
      evidence: file.evidence,
    })),
    limitations: [] as string[],
    elapsedMs: Date.now() - startedAt,
  }

  pkg.diagnostics = diagnostic
  diagnostic.capabilities = buildPipelineCapabilities(pkg)
  diagnostic.limitations = buildPipelineLimitations(pkg, notices)
  return diagnostic
}

export async function runImportPipeline(input: {
  evaluationId: string
  createdBy: string
  files: IncomingFile[]
  /** Indicación libre del profesional: orienta, nunca reemplaza las reglas del sistema. */
  instruction?: string
  /** Extracto compacto del expediente (`compactContextForAI`), para que Detection AI lo use. */
  context?: unknown
  /** Hitos reales del procesamiento, para la pantalla de progreso. Nunca simulado. */
  onStage?: (stage: PackageStage) => void
}): Promise<PipelineResult> {
  const startedAt = Date.now()
  const notify = (stage: PackageStage) => input.onStage?.(stage)
  notify('UPLOAD')

  const pkg = createInstrumentPackage({ evaluationId: input.evaluationId, createdBy: input.createdBy })

  notify('SECURITY_SCAN')
  const { files, sources, notices, workbookAnalyses } = await collectFiles(input.files)
  pkg.files = files
  const archiveSource = input.files.find((file) => /\.(rar|zip)$/i.test(file.path))
  if (archiveSource) {
    pkg.originalArchive = {
      fileId: crypto.randomUUID(),
      name: archiveSource.path.split('/').pop() ?? archiveSource.path,
      size: archiveSource.bytes.length,
      checksum: await checksumOf(archiveSource.bytes),
    }
  }
  notify('ARCHIVE_EXTRACTION')

  const accepted = files.filter((file) => file.status === 'ACCEPTED')
  if (accepted.length === 0) {
    notify('REVIEW')
    return {
      pkg: {
        ...pkg,
        stage: 'REVIEW',
        readiness: 'FAILED',
        errorMessage: 'Ningún archivo del material pudo procesarse.',
        diagnostics: buildPipelineDiagnostic(pkg, workbookAnalyses, notices, startedAt),
        updatedAt: new Date().toISOString(),
      },
      blueprint: null,
      notices,
    }
  }

  // El nombre sale del material identificado, no del archivo suelto: el manual
  // es el que da nombre al instrumento con más frecuencia.
  const namingFile =
    accepted.find((file) => file.role === 'MANUAL') ??
    accepted.find((file) => file.role === 'QUESTION_BOOKLET') ??
    accepted[0]

  const identity = resolveInstrumentIdentity([
    namingFile.name,
    ...accepted.map((file) => file.name),
    ...input.files.map((file) => file.path),
  ])
  const acronym = identity.acronym ?? acronymOf(namingFile.name)
  pkg.name = identity.confidence > 0 ? identity.name : acronym ?? null
  pkg.fingerprint = {
    normalizedName: normalizeName(pkg.name ?? acronym ?? namingFile.name) || null,
    acronym,
    authors: [],
    version: null,
    itemCount: null,
    scales: [],
    checksums: accepted.map((file) => file.checksum),
  }
  pkg.instrumentIdentity = pkg.fingerprint

  // Enriquecimiento por IA: sólo completa lo que la heurística no determinó
  // (nombre, autores, versión). Nunca sobrescribe un dato ya resuelto, y su
  // ausencia -sin clave configurada, o si falla- no detiene el análisis.
  let extraRequiredFields: string[] = []
  if (hasGeminiKey()) {
    try {
      const enrichment = await classifyInstrumentWithGemini({
        materials: accepted.map((file) => ({
          name: file.name,
          role: file.role,
          mime: file.detectedMime ?? file.declaredMime,
          size: file.size,
        })),
        heuristicName: pkg.name,
        instruction: input.instruction,
        context: input.context,
      })
      // `reviewRequired: false` es lo único que autoriza a tomar una afirmación
      // de identidad como confiable. Con `true` (o si el campo no vino), Detection
      // AI está diciendo que no tiene evidencia suficiente, y su propio `name` en
      // ese caso suele ser una descripción de la incertidumbre («instrumento no
      // identificado»), no un nombre real: tratarlo como nombre sería justo el
      // dato inventado que esta pantalla no puede mostrar.
      const identityTrusted = enrichment.reviewRequired === false
      if (identityTrusted) {
        if (!pkg.name && enrichment.name) pkg.name = enrichment.name
        if (enrichment.version && !pkg.fingerprint.version) {
          pkg.fingerprint = { ...pkg.fingerprint, version: enrichment.version }
        }
        if (enrichment.authors?.length && pkg.fingerprint.authors.length === 0) {
          pkg.fingerprint = { ...pkg.fingerprint, authors: enrichment.authors }
        }
        pkg.instrumentIdentity = pkg.fingerprint
      }
      extraRequiredFields = enrichment.requiredFields ?? []
      if (enrichment.priorityNotes?.length) notices.push(...enrichment.priorityNotes)
      if (enrichment.limitations?.length) notices.push(...enrichment.limitations)
    } catch {
      notices.push('Detection AI no pudo enriquecer el análisis; se conserva el resultado del reconocimiento automático.')
    }
  }
  notify('FILE_CLASSIFICATION')

  const readings = await readAcrossFiles(files, sources)
  notify('DOCUMENT_ANALYSIS')
  const findings = buildFindings(readings)
  pkg.findings = findings
  pkg.computedResults = accepted.flatMap((file) => {
    if (file.role !== 'AUTOMATED_SPREADSHEET' && file.role !== 'SCORING_TEMPLATE') return []
    const source = sources.find((item) => item.path === file.path)
    return source ? extractComputedResultsFromSpreadsheet(source.bytes, file.name) : []
  })
  pkg.consistency = buildConsistencyMatrix(readings)
  notify('SPREADSHEET_ANALYSIS')
  pkg.blocks = buildBlocks(pkg, findings)
  pkg.readiness = readinessOf(pkg, pkg.blocks)
  notify('CROSS_VALIDATION')
  const blueprintCandidate = buildBlueprintCandidate(pkg)
  const blueprint =
    blueprintCandidate && extraRequiredFields.length > 0
      ? { ...blueprintCandidate, requiredFields: [...new Set([...blueprintCandidate.requiredFields, ...extraRequiredFields])] }
      : blueprintCandidate
  pkg.blueprintId = blueprint?.id ?? null
  pkg.blueprintVersion = blueprint ? `${blueprint.shortName}@${blueprint.version}` : null
  notify('BLUEPRINT_GENERATION')
  pkg.responseCandidates = await detectCompletedResponses({
    files,
    sources: sources.map((source) => ({
      fileId: files.find((file) => file.path === source.path)?.id ?? source.path,
      fileName: source.path.split('/').pop() ?? source.path,
      path: source.path,
      bytes: source.bytes,
    })),
    instrumentId: pkg.fingerprint.acronym ?? pkg.name,
  })
  const completedCandidates = pkg.responseCandidates.filter((candidate) => candidate.status === 'COMPLETED_RESPONSE')
  pkg.extractedResponses = await Promise.all(
    completedCandidates.map((candidate) =>
      extractResponses({
        blueprint,
        candidate,
        files,
        sources: sources.map((source) => ({
          fileId: files.find((file) => file.path === source.path)?.id ?? source.path,
          fileName: source.path.split('/').pop() ?? source.path,
          path: source.path,
          bytes: source.bytes,
        })),
      }),
    ),
  )
  const responseComputedResults = pkg.extractedResponses.flatMap((set) => {
    const extracted = set.responses.filter((response) => response.status === 'EXTRACTED')
    if (extracted.length === 0) return []
    const rawTotal = extracted.reduce((sum, response) => {
      const value = Number(response.normalizedValue)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
    return [
      {
        measureId: `${pkg.id}.extracted-direct-score`,
        label: 'Puntuación directa extraída',
        rawValue: String(rawTotal),
        transformedValue: null,
        percentile: null,
        classification: null,
        sourceFile: set.sourceFiles.join(', '),
        sourceLocation: `${extracted.length} respuestas`,
        confidence: Math.min(0.95, set.completionRate || 0.75),
      },
    ]
  })
  pkg.computedResults = [...pkg.computedResults, ...responseComputedResults]
  if (pkg.extractedResponses.some((set) => set.responses.length > 0) && pkg.readiness !== 'READY') {
    pkg.readiness = 'PARTIAL_READY'
  }
  pkg.diagnostics = buildPipelineDiagnostic(pkg, workbookAnalyses, notices, startedAt)
  pkg.stage = 'REVIEW'
  pkg.updatedAt = new Date().toISOString()
  notify('REVIEW')

  return { pkg, blueprint, notices }
}

/** Progreso de etapas para la pantalla de procesamiento. */
export function stageProgress(stage: InstrumentPackage['stage']) {
  const index = packageStages.indexOf(stage)
  return { index, total: packageStages.length }
}
