import { getInstrument } from '@/instruments/catalog'
import type { ABCResult, EvaluationRecord, InstrumentResult, ProCalculoResult, StudentData } from '@/types/psychopedagogy'

export function calculateAgeYears(birthDate: string, evaluationDate: string) {
  if (!birthDate || !evaluationDate) return 0
  const birth = new Date(`${birthDate}T00:00:00`)
  const evaluation = new Date(`${evaluationDate}T00:00:00`)
  const diff = evaluation.getTime() - birth.getTime()
  return Math.max(0, Math.round((diff / 31557600000) * 10) / 10)
}

export function validateInstrumentAge(student: StudentData, instrumentId: string) {
  const instrument = getInstrument(instrumentId)
  if (!instrument) return false
  return student.ageYears < instrument.edadMin || student.ageYears > instrument.edadMax
}

export function classifyABC(total: number) {
  if (total >= 17) return { range: 'RANGO I', level: 'NIVEL SUPERIOR' }
  if (total >= 12) return { range: 'RANGO II', level: 'NIVEL MEDIO' }
  if (total >= 8) return { range: 'RANGO III', level: 'NIVEL INFERIOR' }
  return { range: 'RANGO IV', level: 'NIVEL MAS BAJO' }
}

export function classifyProCalculoPT(pt: number) {
  if (pt <= 39) return 'BAJO / PRESENTA DIFICULTADES'
  if (pt <= 60) return 'NORMAL'
  return 'ALTO'
}

export function calculateABCResult(evaluation: EvaluationRecord): ABCResult {
  const instrument = getInstrument('test-abc')
  const subtests = instrument!.subtests.map((subtest) => {
    const activity = subtest.actividades[0]
    const response = evaluation.responses[activity.id]
    const score = Number(response?.evaluatorScore ?? response?.score ?? 0)
    return { id: subtest.id, numero: subtest.numero, nombre: subtest.nombre, area: subtest.area, score, max: subtest.puntajeMaximo }
  })
  const total = subtests.reduce((sum, subtest) => sum + subtest.score, 0)
  const classified = classifyABC(total)
  const low = subtests.filter((subtest) => subtest.score <= 1)
  const high = subtests.filter((subtest) => subtest.score >= 2)
  const warnings = [
    ...(evaluation.ageWarning ? ['Edad fuera del rango indicado para el instrumento. Interpretar con precaucion.'] : []),
    'Reactivos oficiales completos pendientes de configurar. No se inventaron preguntas ni criterios ausentes.',
  ]

  return {
    kind: 'abc',
    total,
    range: classified.range,
    level: classified.level,
    subtests,
    interpretation: `De acuerdo con el baremo incorporado al instrumento, la puntuacion obtenida corresponde al ${classified.range} - ${classified.level}.`,
    strengths: high.length ? high.map((item) => item.area) : ['No hay fortalezas cuantitativas suficientes registradas.'],
    supportAreas: low.length ? low.map((item) => item.area) : ['No se identifican areas bajas con la informacion registrada.'],
    warnings,
    recommendations: generateRecommendations(low.map((item) => item.area)),
  }
}

export function calculateProCalculoResult(evaluation: EvaluationRecord): ProCalculoResult {
  const instrument = getInstrument('pro-calculo')!
  const rows = instrument.subtests.map((subtest) => {
    const pd = Number(evaluation.responses[`pc-${subtest.numero}-pd`]?.responseValue || 0)
    const rawPt = evaluation.responses[`pc-${subtest.numero}-pt`]?.responseValue
    const pt = rawPt === undefined || rawPt === '' ? undefined : Number(rawPt)
    return {
      id: subtest.id,
      subtest: subtest.nombre,
      pd,
      pt,
      classification: typeof pt === 'number' && Number.isFinite(pt) ? classifyProCalculoPT(pt) : 'PT PENDIENTE',
      manualPt: typeof pt === 'number' && Number.isFinite(pt),
      observations: evaluation.responses[`pc-${subtest.numero}-pd`]?.evaluatorObservation ?? '',
    }
  })
  const supportRows = rows.filter((row) => row.classification.startsWith('BAJO'))
  const strengthRows = rows.filter((row) => row.classification === 'ALTO')

  return {
    kind: 'pro-calculo',
    pdTotal: rows.reduce((sum, row) => sum + row.pd, 0),
    ptGlobalManual: false,
    rows,
    interpretation: 'La clasificacion se genera a partir de las PT disponibles: <=39 bajo, 40-60 normal y >60 alto. La conversion PD a PT queda pendiente hasta cargar tablas normativas completas.',
    strengths: strengthRows.length ? strengthRows.map((row) => row.subtest) : ['No hay subtests altos registrados.'],
    supportAreas: supportRows.length ? supportRows.map((row) => row.subtest) : ['No hay subtests bajos registrados con la informacion disponible.'],
    warnings: [
      ...(evaluation.ageWarning ? ['Edad fuera del rango indicado para el instrumento. Interpretar con precaucion.'] : []),
      'Tabla normativa PD a PT pendiente de configurar. Las PT fueron ingresadas por evaluador cuando aparecen disponibles.',
      'No se genera diagnostico clinico automatico.',
    ],
    recommendations: generateRecommendations(supportRows.map((row) => row.subtest)),
  }
}

export function calculateInstrumentResult(evaluation: EvaluationRecord): InstrumentResult {
  return evaluation.instrumentId === 'test-abc' ? calculateABCResult(evaluation) : calculateProCalculoResult(evaluation)
}

export function generateRecommendations(areas: string[]) {
  const base = [
    'Docente: aplicar refuerzo positivo, instrucciones claras y material visual accesible.',
    'Pedagogo/a de apoyo: planificar actividades graduadas y seguimiento de avances.',
    'DECE: revisar el proceso desde una mirada educativa y coordinar apoyos institucionales.',
    'Representante legal: acompanamiento familiar con rutinas breves y consistentes.',
    'Psicopedagogo/a: revisar resultados, observaciones y pertinencia de adaptaciones curriculares.',
  ]
  if (!areas.length) return base
  return [...base, `Areas sugeridas para apoyo: ${areas.join(', ')}.`]
}

export function generateInterpretation(evaluation: EvaluationRecord) {
  return calculateInstrumentResult(evaluation).interpretation
}
