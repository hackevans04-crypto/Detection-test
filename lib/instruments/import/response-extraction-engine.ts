import type {
  CompletedResponseCandidate,
  ExtractedResponse,
  ExtractedResponseSet,
  PackageFile,
} from '@/lib/instruments/import/package-model'
import type { InstrumentBlueprint } from '@/lib/evaluations/model'
import { readSourceText, type ReadableSource } from '@/lib/instruments/import/content-reader'
import { normalizeName } from '@/lib/instruments/import/identity-resolver'
import { inferExpectedItemCount } from '@/lib/instruments/instrument-registry'

const patterns = [
  /\b(?:item|reactivo|pregunta|q)\s*0*([1-9][0-9]{0,2})\s*(?:[:=|\-]|->)\s*([A-Ea-e]|[0-4]|siempre|casi siempre|a veces|nunca)\b/gi,
  /^\s*0*([1-9][0-9]{0,2})\s*(?:[:=|\-]|->)\s*([A-Ea-e]|[0-4]|siempre|casi siempre|a veces|nunca)\s*$/gim,
  /^\s*(?:\[[^\]]+\]\s*)?0*([1-9][0-9]{0,2})\s*\|\s*([A-Ea-e]|[0-4]|siempre|casi siempre|a veces|nunca)\b/gim,
]

export async function extractResponses(input: {
  blueprint: InstrumentBlueprint | null
  candidate: CompletedResponseCandidate
  files: PackageFile[]
  sources: ReadableSource[]
}): Promise<ExtractedResponseSet> {
  const file = input.files.find((item) => item.id === input.candidate.fileId)
  const source = file ? input.sources.find((item) => item.path === file.path) : null
  if (!file || !source || input.candidate.status !== 'COMPLETED_RESPONSE') {
    return emptySet(input.blueprint, input.candidate.instrumentId, ['No hay fuente respondida procesable.'])
  }

  const document = await readSourceText({ ...source, fileId: file.id, fileName: file.name })
  const responses = extractResponsesFromText(document.text, file.name)
  const expected = expectedItems(input.blueprint, file.name, document.text) ?? (responses.length > 0 ? responses.length : null)

  return {
    instrumentId: input.candidate.instrumentId,
    sourceFiles: [file.name],
    totalItemsExpected: expected,
    totalItemsExtracted: responses.length,
    completionRate: expected ? Math.min(1, responses.length / expected) : responses.length > 0 ? 1 : 0,
    responses,
    warnings: responses.length === 0 ? ['No se extrajeron respuestas inequívocas.'] : [],
  }
}

export function extractResponsesFromText(text: string, sourceFile = 'archivo'): ExtractedResponse[] {
  const byItem = new Map<string, ExtractedResponse>()
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const itemId = String(Number(match[1]))
      const normalizedValue = normalizeResponseValue(match[2])
      const status = normalizedValue ? 'EXTRACTED' : 'INVALID'
      const existing = byItem.get(itemId)
      if (existing && existing.normalizedValue !== normalizedValue) {
        byItem.set(itemId, { ...existing, status: 'AMBIGUOUS', confidence: 0.45 })
        continue
      }
      byItem.set(itemId, {
        itemId,
        rawValue: match[2],
        normalizedValue: normalizedValue || match[2],
        sourceFile,
        sourceLocation: lineOf(text, match.index),
        confidence: status === 'EXTRACTED' ? 0.88 : 0.35,
        status,
      })
    }
  }
  return [...byItem.values()].sort((a, b) => Number(a.itemId) - Number(b.itemId))
}

export function normalizeResponseValue(value: string) {
  const normalized = normalizeName(value)
  if (/^[0-4]$/.test(normalized)) return normalized
  const letters: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' }
  if (letters[normalized]) return letters[normalized]
  if (normalized === 'nunca') return '1'
  if (normalized === 'a veces') return '2'
  if (normalized === 'casi siempre') return '3'
  if (normalized === 'siempre') return '4'
  return ''
}

function expectedItems(blueprint: InstrumentBlueprint | null, fileName: string, text: string) {
  return inferExpectedItemCount([fileName, blueprint?.shortName, blueprint?.name], text)
}

function emptySet(blueprint: InstrumentBlueprint | null, instrumentId: string | null, warnings: string[]): ExtractedResponseSet {
  return {
    instrumentId,
    sourceFiles: [],
    totalItemsExpected: blueprint ? null : null,
    totalItemsExtracted: 0,
    completionRate: 0,
    responses: [],
    warnings,
  }
}

function lineOf(text: string, index: number) {
  return `línea ${text.slice(0, index).split(/\r?\n/).length}`
}
