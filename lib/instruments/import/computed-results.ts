import * as XLSX from 'xlsx'
import { normalizeName } from '@/lib/instruments/import/identity-resolver'
import type { ImportedComputedResult } from '@/lib/instruments/import/package-model'

const resultLabelPattern =
  /\b(total|resultado final|puntuacion directa|puntuacion transformada|puntuacion tipica|percentil|centil|t score|decatipo|sten|clasificacion|indice|subtest|escala)\b/i

const percentilePattern = /\b(?:p|percentil|centil)\s*([0-9]{1,3})\b/i

export function extractComputedResultsFromSpreadsheet(bytes: Uint8Array, fileName: string): ImportedComputedResult[] {
  try {
    const workbook = XLSX.read(Buffer.from(bytes), {
      type: 'buffer',
      cellFormula: true,
      cellNF: false,
      cellStyles: false,
      cellHTML: false,
    })

    return workbook.SheetNames.flatMap((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(worksheet, {
        header: 1,
        raw: false,
        defval: null,
      })
      const results: ImportedComputedResult[] = []

      rows.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
          const label = String(cell ?? '').trim()
          if (!resultLabelPattern.test(normalizeName(label))) return

          const value = firstValue(row[columnIndex + 1], rows[rowIndex + 1]?.[columnIndex])
          if (!value) return

          results.push(toImportedComputedResult({
            label,
            value,
            sourceFile: fileName,
            sourceLocation: `${sheetName}!${XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })}`,
          }))
        })
      })

      return dedupeComputedResults(results).slice(0, 24)
    })
  } catch {
    return []
  }
}

function firstValue(...values: Array<string | number | boolean | null | undefined>) {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return null
}

function toImportedComputedResult(input: {
  label: string
  value: string
  sourceFile: string
  sourceLocation: string
}): ImportedComputedResult {
  const label = input.label.trim()
  const normalized = normalizeName(label)
  const numeric = input.value.match(/-?\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.') ?? null
  const percentile = percentilePattern.exec(`${label} ${input.value}`)?.[1] ?? null
  const isPercentile = /\b(percentil|centil)\b/i.test(normalized)
  const isClassification = /\b(clasificacion|resultado final)\b/i.test(normalized) && !numeric
  const isTransformed = /\b(transformada|tipica|t score|decatipo|sten|indice)\b/i.test(normalized)

  return {
    measureId: normalizeName(label) || 'resultado-importado',
    label,
    rawValue: !isTransformed && !isPercentile && numeric ? numeric : null,
    transformedValue: isTransformed && numeric ? numeric : null,
    percentile: percentile ? Math.max(0, Math.min(100, Number(percentile))) : isPercentile && numeric ? Math.max(0, Math.min(100, Number(numeric))) : null,
    classification: isClassification ? input.value : null,
    sourceFile: input.sourceFile,
    sourceLocation: input.sourceLocation,
    confidence: 0.78,
  }
}

function dedupeComputedResults(results: ImportedComputedResult[]) {
  const seen = new Set<string>()
  return results.filter((result) => {
    const key = `${result.measureId}|${result.rawValue}|${result.transformedValue}|${result.percentile}|${result.classification}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
