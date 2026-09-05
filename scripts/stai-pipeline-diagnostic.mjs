import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import * as XLSX from 'xlsx'

const archivePath =
  process.argv[2] ??
  path.join(os.homedir(), 'Downloads', '846. STAI - CUETIONARIO DE ANSIEDAD ESTADO RASGO - PDF + AUTOMATIZADO.rar')
const outPath = path.join(process.cwd(), 'artifacts', 'stai-pipeline-diagnostic.json')

const roleTerms = [
  ['MANUAL', /manual|guia|ficha tecnica/i],
  ['ANSWER_SHEET', /respuesta|respuestas|protocolo|aplicacion/i],
  ['SCORING_WORKBOOK', /software|automatizado|correccion|calculo|xlsx?|xls/i],
  ['NORMS', /baremo|baremos|percentil|norma/i],
  ['QUESTIONNAIRE', /cuadernillo|pregunta|item|reactivo/i],
  ['SUPPORT_DOCUMENT', /documento|apoyo|anexo/i],
]

const bytes = await readFile(archivePath)
const extracted = await extractRar(bytes)
const files = extracted.map((entry) => {
  const extension = path.extname(entry.name).toLowerCase()
  const role = classifyRole(entry.name, extension)
  return {
    id: sha256(Buffer.from(entry.bytes)).slice(0, 16),
    originalName: path.basename(entry.name),
    archivePath: entry.name,
    extension,
    size: entry.bytes.length,
    sha256: sha256(Buffer.from(entry.bytes)),
    semanticRole: role,
    evidence: [`Nombre/ruta: ${entry.name}`, `Extensión: ${extension || 'sin extensión'}`],
    bytes: entry.bytes,
  }
})

const workbookAnalyses = files
  .filter((file) => ['.xls', '.xlsx', '.csv'].includes(file.extension))
  .map((file) => analyzeWorkbook(file))

const applicationCandidates = files.filter((file) =>
  ['ANSWER_SHEET', 'COMPLETED_PROTOCOL'].includes(file.semanticRole),
)
const completedApplicationCandidates = workbookAnalyses.filter((analysis) => analysis.semanticKind === 'COMPLETED_APPLICATION')
const validatedResponses = completedApplicationCandidates.reduce((sum, analysis) => sum + analysis.responseRows, 0)
const importedResults = workbookAnalyses.reduce((sum, analysis) => sum + analysis.importedResultCandidates.length, 0)

const diagnostic = {
  pipelineVersion: 'instrument-ai-v3-diagnostic',
  archive: {
    ok: true,
    name: path.basename(archivePath),
    sha256: sha256(bytes),
    internalFiles: files.length,
  },
  instrument: {
    expected: 'STAI',
    detected: files.some((file) => /stai|ansiedad estado rasgo/i.test(file.archivePath)) ? 'STAI' : null,
    identityConfidence: files.some((file) => /stai/i.test(file.archivePath)) ? 0.98 : 0.65,
  },
  workbooksFound: workbookAnalyses.length,
  workbooksInspected: workbookAnalyses.filter((analysis) => analysis.readable).length,
  documentsFound: files.filter((file) => ['.pdf', '.doc', '.docx', '.txt'].includes(file.extension)).length,
  imagesFound: files.filter((file) => ['.jpg', '.jpeg', '.png', '.webp'].includes(file.extension)).length,
  applicationCandidates: applicationCandidates.length,
  completedApplicationCandidates: completedApplicationCandidates.length,
  responseCandidates: applicationCandidates.length + completedApplicationCandidates.length,
  validatedResponses,
  importedResults,
  capabilities: {
    canIdentify: true,
    canDigitalizeDefinition: files.length > 0,
    hasApplication: completedApplicationCandidates.length > 0,
    canExtractResponses: completedApplicationCandidates.length > 0,
    hasImportedResults: importedResults > 0,
    canScoreRaw: validatedResponses > 0 || importedResults > 0 || workbookAnalyses.some((analysis) => analysis.formulaCells > 0),
    canScoreNormatively: false,
    canShowResults: validatedResponses > 0 || importedResults > 0,
    canGenerateCharts: validatedResponses > 0 || importedResults > 0,
    canGenerateInterpretation: validatedResponses > 0 || importedResults > 0,
    canGenerateReport: validatedResponses > 0 || importedResults > 0,
    canExportToStep7: files.length > 0,
  },
  files: files.map(({ bytes: _bytes, ...file }) => file),
  workbookAnalyses,
  findings: [
    'La extracción del RAR funciona y se inspeccionaron todos los archivos internos procesables.',
    workbookAnalyses.length
      ? 'Las hojas de cálculo fueron abiertas con lectura de hojas, celdas, fórmulas, rangos usados y candidatos de entrada/salida.'
      : 'No se encontraron hojas de cálculo en el paquete.',
    completedApplicationCandidates.length
      ? 'Se encontró al menos una aplicación completada con respuestas verificables.'
      : 'No se encontró una aplicación completada: no hay respuestas del evaluado verificables para puntuar.',
  ],
  generatedAt: new Date().toISOString(),
}

await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8')
console.log(`Diagnóstico STAI escrito en ${outPath}`)

async function extractRar(data) {
  const unrar = await import('node-unrar-js')
  const extractor = await unrar.createExtractorFromData({
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  })
  const extracted = extractor.extract()
  return Array.from(extracted.files)
    .filter((file) => !file.fileHeader.flags?.directory && file.extraction)
    .map((file) => ({ name: file.fileHeader.name.replace(/\\/g, '/'), bytes: Buffer.from(file.extraction) }))
}

function analyzeWorkbook(file) {
  try {
    const workbook = XLSX.read(file.bytes, {
      type: 'buffer',
      cellFormula: true,
      bookVBA: true,
      cellNF: false,
      cellStyles: false,
      cellHTML: false,
    })
    const sheetMetadata = workbook.Workbook?.Sheets ?? []
    const hiddenSheets = workbook.SheetNames.filter((_name, index) => Boolean(sheetMetadata[index]?.Hidden))
    const namedRanges = (workbook.Workbook?.Names ?? []).map((item) => `${item.Name ?? 'rango'}=${item.Ref ?? ''}`)
    const sheets = workbook.SheetNames.map((sheetName, index) => inspectSheet(workbook.Sheets[sheetName], sheetName, Boolean(sheetMetadata[index]?.Hidden)))
    const formulaCells = sheets.reduce((sum, sheet) => sum + sheet.formulaCells, 0)
    const valueCells = sheets.reduce((sum, sheet) => sum + sheet.valueCells, 0)
    const responseRows = sheets.reduce((sum, sheet) => sum + sheet.responseRows, 0)
    const importedResultCandidates = sheets.flatMap((sheet) => sheet.importedResultCandidates)
    const semanticKind = classifyWorkbook({
      fileName: file.originalName,
      sheetNames: workbook.SheetNames,
      formulaCells,
      responseRows,
      importedResults: importedResultCandidates.length,
      valueCells,
    })

    return {
      fileId: file.id,
      fileName: file.originalName,
      readable: true,
      reason: '',
      semanticKind,
      sheetsInspected: sheets.length,
      sheetNames: workbook.SheetNames,
      usedRanges: sheets.map((sheet) => sheet.usedRange).filter(Boolean),
      formulaCells,
      valueCells,
      inputRanges: sheets.flatMap((sheet) => sheet.inputRanges).slice(0, 80),
      outputRanges: sheets.flatMap((sheet) => sheet.outputRanges).slice(0, 80),
      detectedScales: detectScales(`${file.originalName} ${workbook.SheetNames.join(' ')} ${sheets.flatMap((sheet) => sheet.textSamples).join(' ')}`),
      currentInputCoverage: Math.min(1, Number((responseRows / 40).toFixed(2))),
      hasMacros: Boolean(workbook.vbaraw),
      hiddenSheets,
      namedRanges,
      mergedRanges: sheets.reduce((sum, sheet) => sum + sheet.mergedRanges, 0),
      dataValidationRules: 0,
      responseRows,
      importedResultCandidates,
      evidence: [
        `${sheets.length} hojas inspeccionadas.`,
        `${formulaCells} celdas con fórmula.`,
        `${valueCells} celdas con valor.`,
        `${responseRows} filas item/respuesta verificables.`,
      ],
    }
  } catch (error) {
    return {
      fileId: file.id,
      fileName: file.originalName,
      readable: false,
      reason: error instanceof Error ? error.message : 'No se pudo abrir el workbook.',
      semanticKind: 'UNKNOWN',
      sheetsInspected: 0,
      sheetNames: [],
      usedRanges: [],
      formulaCells: 0,
      valueCells: 0,
      inputRanges: [],
      outputRanges: [],
      detectedScales: [],
      currentInputCoverage: 0,
      hasMacros: false,
      hiddenSheets: [],
      namedRanges: [],
      mergedRanges: 0,
      dataValidationRules: 0,
      responseRows: 0,
      importedResultCandidates: [],
      evidence: ['No se pudo inspeccionar la hoja de cálculo.'],
    }
  }
}

function inspectSheet(sheet, sheetName, hidden) {
  let valueCells = 0
  let formulaCells = 0
  const inputRanges = []
  const outputRanges = []
  const textSamples = []
  const numericByRow = new Map()
  const importedResultCandidates = []

  for (const [cell, raw] of Object.entries(sheet)) {
    if (cell.startsWith('!')) continue
    const record = raw
    if (record.f) {
      formulaCells += 1
      outputRanges.push(`${sheetName}!${cell}`)
    }
    if (record.v !== undefined && record.v !== null && String(record.v).trim()) {
      valueCells += 1
      inputRanges.push(`${sheetName}!${cell}`)
      const value = String(record.v).trim()
      if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) && textSamples.length < 80) textSamples.push(value)
      if (/^-?\d+(?:[.,]\d+)?$/.test(value)) {
        const decoded = XLSX.utils.decode_cell(cell)
        const row = numericByRow.get(decoded.r) ?? []
        row.push({ column: decoded.c, value })
        numericByRow.set(decoded.r, row)
      }
    }
  }

  const sheetSignals = `${sheetName} ${textSamples.join(' ')}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
  const hasResponseContext =
    /respuesta|respuestas|protocolo|aplicacion|evaluado|paciente/.test(sheetSignals) &&
    /item|reactivo|pregunta/.test(sheetSignals)
  const responseRows = hasResponseContext
    ? [...numericByRow.values()].filter((row) => {
        const sorted = row.sort((a, b) => a.column - b.column)
        return sorted.some((current, index) => {
          const next = sorted[index + 1]
          const item = Number(current.value)
          const response = Number(next?.value)
          return Number.isInteger(item) && item >= 1 && item <= 250 && Number.isInteger(response) && response >= 0 && response <= 5
        })
      }).length
    : 0

  for (const [index, label] of textSamples.entries()) {
    if (!/\b(total|resultado|puntuacion|percentil|centil|clasificacion|estado|rasgo)\b/i.test(label)) continue
    importedResultCandidates.push({ sheet: sheetName, label, evidence: `Texto de resultado en muestra ${index + 1}` })
  }

  return {
    name: sheetName,
    hidden,
    usedRange: sheet['!ref'] ?? null,
    valueCells,
    formulaCells,
    inputRanges,
    outputRanges,
    textSamples,
    responseRows,
    importedResultCandidates,
    mergedRanges: sheet['!merges']?.length ?? 0,
  }
}

function classifyWorkbook({ fileName, sheetNames, formulaCells, responseRows, importedResults, valueCells }) {
  const joined = `${fileName} ${sheetNames.join(' ')}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (responseRows >= 3) return 'COMPLETED_APPLICATION'
  if (importedResults > 0 && valueCells > 0 && /resultado|perfil|estado|rasgo/.test(joined)) return 'COMPUTED_RESULTS'
  if (/baremo|percentil|norma/.test(joined)) return 'NORM_TABLE'
  if (formulaCells > 0) return 'BLANK_SCORING_TEMPLATE'
  if (/software|correccion|calculo|plantilla/.test(joined)) return 'SCORING_ENGINE'
  return 'UNKNOWN'
}

function classifyRole(name, extension) {
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) return 'IMAGE'
  if (['.xls', '.xlsx', '.csv'].includes(extension)) return 'SCORING_WORKBOOK'
  const match = roleTerms.find(([_role, pattern]) => pattern.test(name))
  return match?.[0] ?? 'UNKNOWN'
}

function detectScales(text) {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const scales = new Set()
  if (/\bestado\b|ansiedad estado/.test(normalized)) scales.add('Estado')
  if (/\brasgo\b|ansiedad rasgo/.test(normalized)) scales.add('Rasgo')
  if (/percentil|centil/.test(normalized)) scales.add('Percentil')
  if (/total|puntuacion directa|\bpd\b/.test(normalized)) scales.add('Puntuación directa')
  return [...scales]
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}
