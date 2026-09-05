import {
  type ConsistencyRow,
  type ConsistencyState,
  type PackageFile,
  type PackageFinding,
  type SourceReference,
} from '@/lib/instruments/import/package-model'

/**
 * Contraste entre los materiales del paquete.
 *
 * Analizar cada archivo por separado y quedarse ahí desaprovecha lo más útil
 * del paquete: que el manual, la hoja de respuestas y el Excel hablan del mismo
 * instrumento y pueden contradecirse. Que los tres digan «90 ítems» es lo que
 * convierte esa cifra en un dato fiable; que uno diga 89 es exactamente lo que
 * hay que enseñarle a alguien antes de automatizar nada.
 *
 * Esta comparación no resuelve el conflicto ni elige la fuente «mejor». Lo
 * presenta.
 */

export type Reading = {
  fileId: string
  fileName: string
  field: string
  value: string
  confidence: number
  locator: string | null
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Compara números por su valor, no por su forma: «90» y «90 ítems» coinciden. */
function comparableValue(value: string) {
  const numeric = /(-?\d+(?:[.,]\d+)?)/.exec(value)
  return numeric ? numeric[1].replace(',', '.') : normalizeValue(value)
}

function stateFor(values: string[]): ConsistencyState {
  if (values.length === 0) return 'ABSENT'
  if (values.length === 1) return 'PARTIAL'
  const distinct = new Set(values.map(comparableValue))
  return distinct.size === 1 ? 'MATCH' : 'CONFLICT'
}

const fieldLabels: Record<string, string> = {
  itemCount: 'Número de ítems',
  scales: 'Escalas',
  ageRange: 'Edad de aplicación',
  norms: 'Baremos',
  responseOptions: 'Opciones de respuesta',
  administration: 'Administración',
}

export function buildConsistencyMatrix(readings: Reading[]): ConsistencyRow[] {
  const byField = new Map<string, Reading[]>()
  for (const reading of readings) {
    byField.set(reading.field, [...(byField.get(reading.field) ?? []), reading])
  }

  return [...byField.entries()].map(([field, items]) => {
    const values = items.map((item) => item.value)
    const state = stateFor(values)

    return {
      field: fieldLabels[field] ?? field,
      readings: items.map((item) => ({ fileId: item.fileId, fileName: item.fileName, value: item.value })),
      state,
      detail:
        state === 'CONFLICT'
          ? `Los materiales no coinciden: ${items.map((item) => `${item.fileName} dice ${item.value}`).join('; ')}.`
          : state === 'PARTIAL'
            ? `Sólo ${items[0].fileName} declara este dato; requiere validación.`
            : state === 'MATCH'
              ? `${items.length} materiales coinciden.`
              : 'No se encontró en ningún material.',
    }
  })
}

/**
 * Convierte lecturas en hallazgos del instrumento. Cuando varias fuentes
 * coinciden, el hallazgo se queda con el valor y cita a todas; cuando no
 * coinciden, no se elige ninguna y el hallazgo queda marcado como discrepante.
 */
export function buildFindings(readings: Reading[]): PackageFinding[] {
  const byField = new Map<string, Reading[]>()
  for (const reading of readings) {
    byField.set(reading.field, [...(byField.get(reading.field) ?? []), reading])
  }

  return [...byField.entries()].map(([field, items]) => {
    const state = stateFor(items.map((item) => item.value))
    const sources: SourceReference[] = items.map((item) => ({
      fileId: item.fileId,
      fileName: item.fileName,
      locator: item.locator,
      confidence: item.confidence,
    }))

    return {
      id: crypto.randomUUID(),
      field: fieldLabels[field] ?? field,
      value:
        state === 'CONFLICT'
          ? `Sin determinar · valores en conflicto (${items.map((item) => item.value).join(' / ')})`
          : items[0].value,
      sources,
    }
  })
}

/**
 * Qué materiales aporta el paquete. Es la lectura rápida de si un instrumento
 * puede llegar a aplicarse o sólo a guardarse.
 */
export function materialCoverage(files: PackageFile[]) {
  const present = new Set(files.filter((file) => file.status === 'ACCEPTED').map((file) => file.role))
  return {
    hasManual: present.has('MANUAL'),
    hasBooklet: present.has('QUESTION_BOOKLET') || present.has('STIMULUS_BOOK'),
    hasAnswerSheet: present.has('ANSWER_SHEET'),
    hasSpreadsheet:
      present.has('AUTOMATED_SPREADSHEET') || present.has('SCORING_TEMPLATE') || present.has('CORRECTION_GUIDE'),
    hasNorms: present.has('NORMS'),
    unclassified: files.filter((file) => file.status === 'ACCEPTED' && file.role === 'UNKNOWN').length,
  }
}
