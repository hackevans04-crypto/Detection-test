import type { CompletedResponseCandidate, PackageFile } from '@/lib/instruments/import/package-model'
import { normalizeName } from '@/lib/instruments/import/identity-resolver'
import { readSourceText, type ReadableSource } from '@/lib/instruments/import/content-reader'
import { analyzeSpreadsheet, type SpreadsheetAnalysis } from '@/lib/instruments/import/spreadsheet-analyzer'
import { inferExpectedItemCount } from '@/lib/instruments/instrument-registry'

const responsePatterns = [
  /\b(?:item|reactivo|pregunta|q)\s*0*([1-9][0-9]{0,2})\s*(?:[:=|\-]|->)\s*([A-Ea-e]|[0-4])\b/gi,
  /^\s*0*([1-9][0-9]{0,2})\s*(?:[:=|\-]|->)\s*([A-Ea-e]|[0-4])\s*$/gm,
  /^\s*(?:\[[^\]]+\]\s*)?0*([1-9][0-9]{0,2})\s*\|\s*([A-Ea-e]|[0-4])\b/gm,
]

const computedPattern = /\b(?:total|puntuacion|puntuación|percentil|centil|clasificacion|clasificación|decatipo|sten|indice|índice)\b/i
const scoringPattern = /\b(?:baremo|clave|correccion|corrección|formula|fórmula|plantilla)\b/i
const blankPattern = /\b(?:nombre|edad|fecha|firma|item|pregunta|respuesta)\b/i

export async function detectCompletedResponses(input: {
  files: PackageFile[]
  sources: ReadableSource[]
  instrumentId?: string | null
}): Promise<CompletedResponseCandidate[]> {
  const sources = new Map(input.sources.map((source) => [source.path, source]))
  const candidates: CompletedResponseCandidate[] = []

  for (const file of input.files.filter((item) => item.status === 'ACCEPTED')) {
    const source = sources.get(file.path)
    if (!source) continue
    const document = await readSourceText({ ...source, fileId: file.id, fileName: file.name })
    const spreadsheet = /\.(xlsx|xls|csv)$/i.test(file.name) ? await analyzeSpreadsheet(source.bytes, file.name) : null
    candidates.push(classifyResponseCandidate(file, document.text, input.instrumentId ?? null, spreadsheet))
  }

  return candidates
}

export function classifyResponseCandidate(
  file: PackageFile,
  text: string,
  instrumentId: string | null,
  spreadsheet?: SpreadsheetAnalysis | null,
): CompletedResponseCandidate {
  const normalizedName = normalizeName(file.name)
  const normalizedText = normalizeName(text)
  const textualResponses = countResponses(text)
  const expected = inferExpectedItemCount([file.name, instrumentId], text) ?? Math.max(20, countItemMentions(text))
  const semanticResponses =
    spreadsheet?.semanticKind === 'COMPLETED_APPLICATION'
      ? Math.max(textualResponses, Math.round(spreadsheet.currentInputCoverage * expected))
      : 0
  const responseCount = Math.max(textualResponses, semanticResponses)
  const evidence: string[] = []
  let status: CompletedResponseCandidate['status'] = 'UNKNOWN'
  let confidence = 0.2

  if (spreadsheet?.semanticKind === 'COMPLETED_APPLICATION') {
    status = 'COMPLETED_RESPONSE'
    confidence = Math.min(0.95, 0.65 + responseCount / 120)
    evidence.push(...spreadsheet.semanticEvidence)
    evidence.push('La hoja contiene pares verificables de item y respuesta.')
  } else if (spreadsheet?.semanticKind === 'COMPUTED_RESULTS') {
    status = 'COMPUTED_RESULT'
    confidence = 0.78
    evidence.push(...spreadsheet.semanticEvidence)
  } else if (spreadsheet?.semanticKind === 'BLANK_SCORING_TEMPLATE' || spreadsheet?.semanticKind === 'SCORING_ENGINE') {
    status = 'SCORING_TEMPLATE'
    confidence = spreadsheet.semanticKind === 'BLANK_SCORING_TEMPLATE' ? 0.78 : 0.68
    evidence.push(...spreadsheet.semanticEvidence)
  } else if (spreadsheet?.semanticKind === 'NORM_TABLE') {
    status = 'SCORING_TEMPLATE'
    confidence = 0.7
    evidence.push(...spreadsheet.semanticEvidence)
  } else if (responseCount > 0) {
    status = 'COMPLETED_RESPONSE'
    confidence = Math.min(0.95, 0.55 + responseCount / 100)
    evidence.push(`${responseCount} respuestas por item detectadas.`)
  } else if (file.role === 'ANSWER_SHEET' && /respuesta|protocolo|aplicacion|aplicación/.test(normalizedText) && /evaluado|paciente|nombre|fecha/.test(normalizedText)) {
    status = 'BLANK_FORM'
    confidence = 0.65
    evidence.push('Hoja de respuestas sin marcas de aplicación.')
  } else if (computedPattern.test(text) && /\b[0-9]{1,3}\b/.test(text)) {
    status = 'COMPUTED_RESULT'
    confidence = 0.7
    evidence.push('Resultados calculados detectados.')
  } else if (file.role === 'SCORING_TEMPLATE' || scoringPattern.test(`${normalizedName} ${normalizedText}`)) {
    status = 'SCORING_TEMPLATE'
    confidence = 0.65
    evidence.push('Material de corrección detectado.')
  } else if (blankPattern.test(text) || file.role === 'ANSWER_SHEET') {
    status = 'BLANK_FORM'
    confidence = 0.45
    evidence.push('Formulario sin respuestas inequívocas.')
  }

  return {
    fileId: file.id,
    instrumentId,
    status,
    responseCount: status === 'COMPLETED_RESPONSE' ? responseCount : 0,
    completeness: responseCount > 0 ? Math.min(1, responseCount / expected) : spreadsheet?.currentInputCoverage ?? 0,
    confidence,
    evidence: evidence.length ? evidence : ['Sin evidencia suficiente de aplicación respondida.'],
  }
}

export function countResponses(text: string) {
  const keys = new Set<string>()
  for (const pattern of responsePatterns) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      keys.add(match[1])
    }
  }
  return keys.size
}

function countItemMentions(text: string) {
  const matches = text.match(/\b(?:item|reactivo|pregunta|q)\s*[0-9]{1,3}\b/gi)
  return matches?.length ?? 20
}
