export type ExpectedItemRule =
  | number
  | {
      count: number
      whenAll?: string[]
      whenAny?: string[]
    }

export type NormativeAgeRange = {
  minYears?: number
  maxYears?: number
  label: string
  foundation: string
}

export type InstrumentRegistryEntry = {
  acronym: string
  displayName: string
  subtitle: string
  patterns: string[]
  expectedItems?: ExpectedItemRule[]
  normativeAgeRange?: NormativeAgeRange
}

export type NormativeApplicability =
  | { status: 'UNKNOWN'; entry: InstrumentRegistryEntry | null; range: null; foundation: string | null }
  | { status: 'APPLICABLE' | 'NOT_APPLICABLE'; entry: InstrumentRegistryEntry; range: NormativeAgeRange; foundation: string }

export function normalizeInstrumentText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const registry: InstrumentRegistryEntry[] = [
  {
    acronym: 'STAI',
    displayName: 'STAI',
    subtitle: 'Inventario de Ansiedad Estado-Rasgo',
    patterns: [
      'stai',
      'cuestionario de ansiedad estado',
      'cuestionario de ansiedad rasgo',
      'inventario de ansiedad estado rasgo',
      'state trait anxiety',
    ],
    expectedItems: [
      { count: 40, whenAll: ['estado', 'rasgo'] },
      { count: 20, whenAny: ['estado', 'rasgo'] },
    ],
  },
  {
    acronym: 'ENFEN',
    displayName: 'ENFEN',
    subtitle: 'Evaluación neuropsicológica de las funciones ejecutivas',
    patterns: ['enfen', 'evaluacion neuropsicologica de las funciones ejecutivas'],
    normativeAgeRange: {
      minYears: 6,
      maxYears: 12,
      label: '6-12 años',
      foundation: 'Rango normativo indicado para población infantil de 6 a 12 años.',
    },
  },
  {
    acronym: 'BENDER',
    displayName: 'BENDER',
    subtitle: 'Test Gestáltico Visomotor de Bender',
    patterns: ['bender'],
  },
  {
    acronym: 'MACI',
    displayName: 'MACI',
    subtitle: 'Inventario Clínico para Adolescentes de Millon',
    patterns: ['maci', 'inventario clinico para adolescentes de millon'],
    expectedItems: [160],
    normativeAgeRange: {
      minYears: 13,
      maxYears: 19,
      label: '13-19 años',
      foundation: 'Instrumento orientado a población adolescente; edades fuera del rango requieren criterio profesional.',
    },
  },
  {
    acronym: 'WISC-V',
    displayName: 'WISC-V',
    subtitle: 'Escala de Inteligencia de Wechsler para Niños',
    patterns: ['wisc v', 'wisc-v'],
  },
]

export function getInstrumentRegistry() {
  return registry
}

export function findInstrumentRegistryEntry(values: Array<string | null | undefined>) {
  const normalized = normalizeInstrumentText(values.filter(Boolean).join(' '))
  const compact = normalized.replace(/\s+/g, '')

  return (
    registry.find((entry) =>
      entry.patterns.some((pattern) => {
        const normalizedPattern = normalizeInstrumentText(pattern)
        return normalized.includes(normalizedPattern) || compact.includes(normalizedPattern.replace(/\s+/g, ''))
      }),
    ) ?? null
  )
}

export function inferExpectedItemCount(values: Array<string | null | undefined>, fallbackText = '') {
  const joined = normalizeInstrumentText([...values, fallbackText].filter(Boolean).join(' '))
  const entry = findInstrumentRegistryEntry(values)
  const registryCount = entry?.expectedItems ? resolveExpectedRule(entry.expectedItems, joined) : null
  if (registryCount !== null) return registryCount

  const declaredCount = explicitItemCount(joined)
  if (declaredCount !== null) return declaredCount

  const mentionedCount = countItemMentions(fallbackText)
  return mentionedCount >= 3 ? mentionedCount : null
}

export function resolveNormativeApplicability(
  values: Array<string | null | undefined>,
  evaluatedYears: number | null,
): NormativeApplicability {
  const entry = findInstrumentRegistryEntry(values)
  if (!entry?.normativeAgeRange || evaluatedYears === null) {
    return { status: 'UNKNOWN', entry, range: null, foundation: null }
  }

  const range = entry.normativeAgeRange
  const below = range.minYears !== undefined && evaluatedYears < range.minYears
  const above = range.maxYears !== undefined && evaluatedYears > range.maxYears

  return {
    status: below || above ? 'NOT_APPLICABLE' : 'APPLICABLE',
    entry,
    range,
    foundation: range.foundation,
  }
}

function resolveExpectedRule(rules: ExpectedItemRule[], normalizedEvidence: string) {
  for (const rule of rules) {
    if (typeof rule === 'number') return rule
    const all = rule.whenAll?.every((term) => normalizedEvidence.includes(normalizeInstrumentText(term))) ?? true
    const any = rule.whenAny ? rule.whenAny.some((term) => normalizedEvidence.includes(normalizeInstrumentText(term))) : true
    if (all && any) return rule.count
  }
  return null
}

function explicitItemCount(text: string) {
  const match = /\b([1-9][0-9]{1,2})\s*(?:items|reactivos|preguntas)\b/i.exec(text)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function countItemMentions(text: string) {
  const keys = new Set<string>()
  const pattern = /\b(?:item|reactivo|pregunta|q)\s*0*([1-9][0-9]{0,2})\b/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    keys.add(String(Number(match[1])))
  }
  return keys.size
}
