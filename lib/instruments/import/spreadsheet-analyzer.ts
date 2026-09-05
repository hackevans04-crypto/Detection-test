import { ZipExtractor } from '@/lib/instruments/import/archive-extractor'
import type { WorkbookSemanticKind } from '@/lib/instruments/import/package-model'
import * as XLSX from 'xlsx'

export type SheetAnalysis = {
  name: string
  usedRange: string | null
  valueCells: number
  formulaCells: number
  sampleFormulas: Array<{ cell: string; formula: string }>
  references: string[]
  inputCandidates: string[]
  resultCandidates: string[]
  normTableCandidates: string[]
  chartSources: string[]
  probableUse: 'INPUT' | 'CALCULATION' | 'NORMS' | 'RESULTS' | 'UNKNOWN'
  textBlocks: string[]
  numericBlocks: string[]
  hidden: boolean
  mergedRanges: number
  dataValidationRules: number
}

export type SpreadsheetAnalysis = {
  readable: boolean
  reason: string
  sheets: SheetAnalysis[]
  hasMacros: boolean
  scoringCandidates: Array<{ sheet: string; cell: string; formula: string; description: string }>
  semanticKind: WorkbookSemanticKind
  inputRanges: string[]
  outputRanges: string[]
  detectedScales: string[]
  currentInputCoverage: number
  hiddenSheets: string[]
  namedRanges: string[]
  mergedRanges: number
  dataValidationRules: number
  semanticEvidence: string[]
}

const COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function columnName(index: number) {
  let name = ''
  let value = index
  while (value >= 0) {
    name = COLUMNS[value % 26] + name
    value = Math.floor(value / 26) - 1
  }
  return name
}

function columnIndex(name: string) {
  return name.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function emptyAnalysis(reason = ''): SpreadsheetAnalysis {
  return {
    readable: false,
    reason,
    sheets: [],
    hasMacros: false,
    scoringCandidates: [],
    semanticKind: 'UNKNOWN',
    inputRanges: [],
    outputRanges: [],
    detectedScales: [],
    currentInputCoverage: 0,
    hiddenSheets: [],
    namedRanges: [],
    mergedRanges: 0,
    dataValidationRules: 0,
    semanticEvidence: [],
  }
}

function readSheetNames(workbookXml: string): string[] {
  const names: string[] = []
  const pattern = /<sheet[^>]*name="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(workbookXml)) !== null) {
    names.push(decodeXml(match[1]))
  }
  return names
}

function readHiddenSheetNames(workbookXml: string): string[] {
  const names: string[] = []
  const pattern = /<sheet\b([^>]*)>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(workbookXml)) !== null) {
    const attributes = match[1]
    if (!/\bstate="(?:hidden|veryHidden)"/i.test(attributes)) continue
    const name = /name="([^"]+)"/.exec(attributes)?.[1]
    if (name) names.push(decodeXml(name))
  }
  return names
}

function readDefinedNames(workbookXml: string): string[] {
  const names: string[] = []
  const pattern = /<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(workbookXml)) !== null && names.length < 80) {
    const label = /name="([^"]+)"/.exec(match[1])?.[1]
    const value = decodeXml(match[2]).trim()
    names.push(label ? `${decodeXml(label)}=${value}` : value)
  }
  return names
}

function probableUseFor(name: string, formulaCells: number, valueCells: number): SheetAnalysis['probableUse'] {
  const normalized = normalize(name)
  if (/baremo|norma|percentil|tabla/.test(normalized)) return 'NORMS'
  if (/resultado|perfil|informe|salida/.test(normalized)) return 'RESULTS'
  if (/respuesta|entrada|datos|registro|captura|aplicacion|protocolo/.test(normalized)) return 'INPUT'
  if (/calculo|correccion|puntuacion|score/.test(normalized)) return 'CALCULATION'
  if (formulaCells > valueCells && formulaCells > 5) return 'CALCULATION'
  if (valueCells > 0 && formulaCells === 0) return 'INPUT'
  return 'UNKNOWN'
}

function usedRangeFromCells(cells: string[]) {
  if (cells.length === 0) return null
  const parsed = cells
    .map((cell) => /^([A-Z]+)(\d+)$/.exec(cell))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ column: columnIndex(match[1]), row: Number(match[2]) }))
  if (parsed.length === 0) return null
  const minColumn = Math.min(...parsed.map((cell) => cell.column))
  const maxColumn = Math.max(...parsed.map((cell) => cell.column))
  const minRow = Math.min(...parsed.map((cell) => cell.row))
  const maxRow = Math.max(...parsed.map((cell) => cell.row))
  return `${columnName(minColumn)}${minRow}:${columnName(maxColumn)}${maxRow}`
}

function sheetReferenceTargets(formula: string) {
  const references = new Set<string>()
  const pattern = /(?:'([^']+)'|([A-Za-z0-9_]+))!/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(formula)) !== null) {
    references.add(match[1] ?? match[2])
  }
  return references
}

function analyzeXmlSheet(name: string, sheetXml: string, sharedStrings: string[], hidden = false): SheetAnalysis {
  let valueCells = 0
  let formulaCells = 0
  const cellRefs: string[] = []
  const sampleFormulas: Array<{ cell: string; formula: string }> = []
  const references = new Set<string>()
  const inputCandidates: string[] = []
  const resultCandidates: string[] = []
  const textBlocks: string[] = []
  const numericBlocks: string[] = []

  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g
  let match: RegExpExecArray | null
  while ((match = cellPattern.exec(sheetXml)) !== null) {
    const attributes = match[1]
    const body = match[2]
    const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? ''
    if (reference) cellRefs.push(reference)

    const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1]
    if (formula) {
      formulaCells += 1
      const decodedFormula = decodeXml(formula).trim()
      if (decodedFormula && sampleFormulas.length < 24) sampleFormulas.push({ cell: reference, formula: decodedFormula })
      if (reference && resultCandidates.length < 40) resultCandidates.push(reference)
      for (const target of sheetReferenceTargets(decodedFormula)) references.add(target)
      continue
    }

    const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
    const inlineValue = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1]
    const isShared = /\bt="s"/.test(attributes)
    const decoded = decodeXml(isShared && rawValue ? sharedStrings[Number(rawValue)] ?? rawValue : inlineValue ?? rawValue ?? '').trim()
    if (!decoded) continue

    valueCells += 1
    if (reference && inputCandidates.length < 40) inputCandidates.push(reference)
    if (/^-?\d+(?:[.,]\d+)?$/.test(decoded) && numericBlocks.length < 40) numericBlocks.push(`${reference}:${decoded}`)
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(decoded) && textBlocks.length < 40) textBlocks.push(`${reference}:${decoded}`)
  }

  const usedRange = usedRangeFromCells(cellRefs)
  const probableUse = probableUseFor(name, formulaCells, valueCells)
  return {
    name,
    usedRange,
    valueCells,
    formulaCells,
    sampleFormulas,
    references: [...references],
    inputCandidates,
    resultCandidates,
    normTableCandidates: probableUse === 'NORMS' && usedRange ? [usedRange] : [],
    chartSources: [],
    probableUse,
    textBlocks,
    numericBlocks,
    hidden,
    mergedRanges: (sheetXml.match(/<mergeCell\b/g) ?? []).length,
    dataValidationRules: (sheetXml.match(/<dataValidation\b/g) ?? []).length,
  }
}

function scoringCandidatesOf(sheets: SheetAnalysis[]) {
  return sheets.flatMap((sheet) =>
    sheet.sampleFormulas
      .filter((item) => /SUM|SUMA|IF|SI|BUSCAR|LOOKUP|INDEX|INDICE|MATCH|COINCIDIR|COUNT|CONTAR|VLOOKUP/i.test(item.formula))
      .map((item) => ({
        sheet: sheet.name,
        cell: item.cell,
        formula: item.formula,
        description:
          sheet.probableUse === 'NORMS'
            ? 'Consulta en tabla: posible conversión a puntuación transformada.'
            : 'Cálculo: posible regla de puntuación.',
      })),
  )
}

function detectScales(text: string) {
  const scales = new Set<string>()
  if (/\bestado\b|ansiedad estado/.test(text)) scales.add('Estado')
  if (/\brasgo\b|ansiedad rasgo/.test(text)) scales.add('Rasgo')
  if (/\btotal\b|puntuacion directa|\bpd\b/.test(text)) scales.add('Puntuación directa')
  if (/percentil|centil/.test(text)) scales.add('Percentil')
  return [...scales]
}

function estimateResponseRows(sheets: SheetAnalysis[]) {
  let rows = 0
  for (const sheet of sheets) {
    const sheetSignals = normalize(`${sheet.name} ${sheet.textBlocks.join(' ')}`)
    const hasResponseContext =
      sheet.probableUse === 'INPUT' ||
      (/respuesta|respuestas|protocolo|aplicacion|evaluado|paciente/.test(sheetSignals) && /item|reactivo|pregunta/.test(sheetSignals))
    if (!hasResponseContext) continue
    rows += countStructuredPairs([...sheet.textBlocks, ...sheet.numericBlocks].join('\n'))
    rows += countAdjacentNumericResponses(sheet.numericBlocks)
  }
  return rows
}

function countStructuredPairs(text: string) {
  const matches = text.match(/\b(?:item|reactivo|pregunta|q)?\s*0*([1-9][0-9]{0,2})\s*(?:[:=|\-])\s*([A-Ea-e]|[0-4])\b/g)
  return matches?.length ?? 0
}

function countAdjacentNumericResponses(blocks: string[]) {
  const byRow = new Map<number, Array<{ column: number; value: string }>>()
  for (const block of blocks) {
    const match = /^([A-Z]+)(\d+):(.+)$/.exec(block)
    if (!match) continue
    const row = Number(match[2])
    const value = match[3].trim()
    const values = byRow.get(row) ?? []
    values.push({ column: columnIndex(match[1]), value })
    byRow.set(row, values)
  }

  let count = 0
  for (const values of byRow.values()) {
    const sorted = values.sort((a, b) => a.column - b.column)
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const item = Number(sorted[index].value)
      const response = Number(sorted[index + 1].value)
      if (Number.isInteger(item) && item >= 1 && item <= 250 && Number.isInteger(response) && response >= 0 && response <= 5) {
        count += 1
        break
      }
    }
  }
  return count
}

function classifyWorkbookSemantic(
  fileName: string,
  sheets: SheetAnalysis[],
  scoringCandidates: SpreadsheetAnalysis['scoringCandidates'],
  metadata: { hasMacros: boolean; hiddenSheets: string[]; namedRanges: string[] },
): Pick<
  SpreadsheetAnalysis,
  'semanticKind' | 'inputRanges' | 'outputRanges' | 'detectedScales' | 'currentInputCoverage' | 'semanticEvidence'
> {
  const text = normalize(`${fileName} ${sheets.map((sheet) => `${sheet.name} ${sheet.textBlocks.join(' ')}`).join(' ')}`)
  const detectedScales = detectScales(text)
  const inputRanges = sheets.flatMap((sheet) => sheet.inputCandidates.map((cell) => `${sheet.name}!${cell}`)).slice(0, 60)
  const outputRanges = sheets.flatMap((sheet) => sheet.resultCandidates.map((cell) => `${sheet.name}!${cell}`)).slice(0, 60)
  const formulaCells = sheets.reduce((sum, sheet) => sum + sheet.formulaCells, 0)
  const numericCells = sheets.reduce((sum, sheet) => sum + sheet.numericBlocks.length, 0)
  const responseRows = estimateResponseRows(sheets)
  const resultSignals = /resultado|puntuacion|percentil|centil|clasificacion|total|\bpd\b|rasgo|estado/.test(text)
  const normSignals = /baremo|baremos|norma|normas|percentil|centil/.test(text)
  const scoringSignals = /correccion|formula|plantilla|calculo|score|puntuacion/.test(text)
  const hasFormulaEngine = formulaCells > 0 || scoringCandidates.length > 0 || metadata.hasMacros
  const currentInputCoverage = inputRanges.length > 0 ? Math.min(1, Number((responseRows / Math.max(20, inputRanges.length)).toFixed(2))) : 0
  const semanticEvidence: string[] = []

  if (sheets.length) semanticEvidence.push(`${sheets.length} hojas inspeccionadas: ${sheets.map((sheet) => sheet.name).join(', ')}.`)
  if (formulaCells > 0) semanticEvidence.push(`${formulaCells} celdas con fórmula inspeccionadas.`)
  if (metadata.hiddenSheets.length > 0) semanticEvidence.push(`Hojas ocultas: ${metadata.hiddenSheets.join(', ')}.`)
  if (metadata.namedRanges.length > 0) semanticEvidence.push(`${metadata.namedRanges.length} rangos con nombre detectados.`)
  if (responseRows > 0) semanticEvidence.push(`${responseRows} filas con patrón item/respuesta detectadas.`)
  if (detectedScales.length > 0) semanticEvidence.push(`Escalas detectadas: ${detectedScales.join(', ')}.`)

  let semanticKind: WorkbookSemanticKind = 'UNKNOWN'
  if (responseRows >= 3) {
    semanticKind = 'COMPLETED_APPLICATION'
  } else if (sheets.some((sheet) => sheet.probableUse === 'RESULTS') && resultSignals && numericCells > 0) {
    semanticKind = 'COMPUTED_RESULTS'
  } else if (normSignals && sheets.some((sheet) => sheet.probableUse === 'NORMS')) {
    semanticKind = 'NORM_TABLE'
  } else if (hasFormulaEngine && currentInputCoverage === 0) {
    semanticKind = 'BLANK_SCORING_TEMPLATE'
  } else if (hasFormulaEngine || scoringSignals) {
    semanticKind = 'SCORING_ENGINE'
  }

  if (semanticKind === 'BLANK_SCORING_TEMPLATE') {
    semanticEvidence.push('Hay motor de cálculo, pero no se encontraron respuestas cargadas en celdas de entrada.')
  }
  if (semanticKind === 'COMPUTED_RESULTS') {
    semanticEvidence.push('Se detectaron celdas de salida con etiquetas de resultado y valores.')
  }
  if (semanticKind === 'UNKNOWN') {
    semanticEvidence.push('No hay evidencia suficiente para decidir si el libro contiene aplicación, baremos o resultados.')
  }

  return {
    semanticKind,
    inputRanges,
    outputRanges,
    detectedScales,
    currentInputCoverage,
    semanticEvidence,
  }
}

function finishAnalysis(
  sheets: SheetAnalysis[],
  hasMacros: boolean,
  hiddenSheets: string[],
  namedRanges: string[],
): SpreadsheetAnalysis {
  const scoringCandidates = scoringCandidatesOf(sheets)
  const semantic = classifyWorkbookSemantic('', sheets, scoringCandidates, { hasMacros, hiddenSheets, namedRanges })
  return {
    readable: sheets.length > 0,
    reason: sheets.length > 0 ? '' : 'El libro no contiene hojas legibles.',
    sheets,
    hasMacros,
    scoringCandidates,
    ...semantic,
    hiddenSheets,
    namedRanges,
    mergedRanges: sheets.reduce((sum, sheet) => sum + sheet.mergedRanges, 0),
    dataValidationRules: sheets.reduce((sum, sheet) => sum + sheet.dataValidationRules, 0),
  }
}

export async function analyzeSpreadsheet(bytes: Uint8Array, fileName: string): Promise<SpreadsheetAnalysis> {
  if (/\.xls$/i.test(fileName)) return analyzeBinaryWorkbook(bytes, fileName)

  let entries
  try {
    entries = (await new ZipExtractor().extract(bytes)).entries
  } catch {
    return emptyAnalysis('No se pudo abrir el libro de cálculo.')
  }

  const find = (path: string) => entries.find((entry) => entry.path.toLowerCase() === path)
  const text = (entry: { bytes: Uint8Array } | undefined) => (entry ? new TextDecoder().decode(entry.bytes) : null)
  const workbookXml = text(find('xl/workbook.xml'))
  if (!workbookXml) return emptyAnalysis('El archivo no tiene la estructura de un libro de cálculo.')

  const sharedStringsXml = text(find('xl/sharedstrings.xml')) ?? ''
  const sharedStrings = [...sharedStringsXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]))
  const hasMacros = entries.some((entry) => /vbaProject\.bin$/i.test(entry.path))
  const names = readSheetNames(workbookXml)
  const hiddenSheets = readHiddenSheetNames(workbookXml)
  const namedRanges = readDefinedNames(workbookXml)
  const sheets = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
    .map((entry, index) => {
      const name = names[index] ?? `Hoja ${index + 1}`
      return analyzeXmlSheet(name, new TextDecoder().decode(entry.bytes), sharedStrings, hiddenSheets.includes(name))
    })

  const analysis = finishAnalysis(sheets, hasMacros, hiddenSheets, namedRanges)
  return { ...analysis, ...classifyWorkbookSemantic(fileName, sheets, analysis.scoringCandidates, { hasMacros, hiddenSheets, namedRanges }) }
}

function analyzeBinaryWorkbook(bytes: Uint8Array, fileName: string): SpreadsheetAnalysis {
  try {
    const workbook = XLSX.read(Buffer.from(bytes), {
      type: 'buffer',
      cellFormula: true,
      bookVBA: true,
      cellNF: false,
      cellStyles: false,
      cellHTML: false,
    })
    const workbookSheets = workbook.Workbook?.Sheets ?? []
    const hiddenSheets = workbook.SheetNames.filter((_name, index) => Boolean(workbookSheets[index]?.Hidden))
    const namedRanges = (workbook.Workbook?.Names ?? [])
      .map((item) => `${item.Name ?? 'rango'}=${item.Ref ?? ''}`.trim())
      .filter(Boolean)

    const sheets = workbook.SheetNames.map((name, sheetIndex) => {
      const worksheet = workbook.Sheets[name]
      let valueCells = 0
      let formulaCells = 0
      const cellRefs: string[] = []
      const sampleFormulas: Array<{ cell: string; formula: string }> = []
      const references = new Set<string>()
      const inputCandidates: string[] = []
      const resultCandidates: string[] = []
      const textBlocks: string[] = []
      const numericBlocks: string[] = []

      for (const [cell, value] of Object.entries(worksheet)) {
        if (cell.startsWith('!')) continue
        cellRefs.push(cell)
        const record = value as XLSX.CellObject
        if (record.f) {
          formulaCells += 1
          if (sampleFormulas.length < 24) sampleFormulas.push({ cell, formula: record.f })
          if (resultCandidates.length < 40) resultCandidates.push(cell)
          for (const target of sheetReferenceTargets(record.f)) references.add(target)
        } else if (record.v !== undefined && record.v !== null && String(record.v).trim().length > 0) {
          valueCells += 1
          if (inputCandidates.length < 40) inputCandidates.push(cell)
          const text = String(record.v).trim()
          if (/^-?\d+(?:[.,]\d+)?$/.test(text) && numericBlocks.length < 40) numericBlocks.push(`${cell}:${text}`)
          if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(text) && textBlocks.length < 40) textBlocks.push(`${cell}:${text}`)
        }
      }

      const usedRange = worksheet['!ref'] ?? usedRangeFromCells(cellRefs)
      const probableUse = probableUseFor(name, formulaCells, valueCells)
      return {
        name,
        usedRange,
        valueCells,
        formulaCells,
        sampleFormulas,
        references: [...references],
        inputCandidates,
        resultCandidates,
        normTableCandidates: probableUse === 'NORMS' && usedRange ? [usedRange] : [],
        chartSources: [],
        probableUse,
        textBlocks,
        numericBlocks,
        hidden: Boolean(workbookSheets[sheetIndex]?.Hidden),
        mergedRanges: worksheet['!merges']?.length ?? 0,
        dataValidationRules: 0,
      }
    })

    const analysis = finishAnalysis(sheets, Boolean((workbook as XLSX.WorkBook & { vbaraw?: unknown }).vbaraw), hiddenSheets, namedRanges)
    return { ...analysis, ...classifyWorkbookSemantic(fileName, sheets, analysis.scoringCandidates, { hasMacros: analysis.hasMacros, hiddenSheets, namedRanges }) }
  } catch {
    return emptyAnalysis('No se pudo abrir el libro .xls para análisis estructural.')
  }
}

export function cellReference(row: number, column: number) {
  return `${columnName(column)}${row + 1}`
}
