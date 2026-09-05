// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ResultsStep } from '@/features/evaluations/steps/results-step'
import { ReportPreview } from '@/features/evaluations/report/report-preview'
import { createEvaluationInstrument, type Evaluation } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { createInstrumentPackage, type PackageFile, type PackageFileRole } from '@/lib/instruments/import/package-model'
import { buildEvaluationAnalytics } from '@/lib/evaluations/analytics/build-evaluation-analytics'
import { buildReport } from '@/lib/evaluations/report'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'

vi.mock('next/image', () => ({
  default: () => null,
}))

vi.mock('@/features/evaluations/workspace/step-footer', () => ({
  StepFooter: () => null,
}))

let evaluation: Evaluation = makeEvaluation()

vi.mock('@/features/evaluations/workspace/evaluation-provider', () => ({
  useEvaluation: () => ({
    evaluation,
    update: vi.fn(),
    saveNow: vi.fn(),
    saveState: 'idle',
    saveError: null,
    lastSavedAt: null,
    dirty: false,
    goToStep: vi.fn(),
  }),
}))

function acceptedFile(name: string, role: PackageFileRole): PackageFile {
  return {
    id: crypto.randomUUID(),
    path: name,
    name,
    extension: '.pdf',
    declaredMime: 'application/pdf',
    detectedMime: 'application/pdf',
    size: 1024,
    checksum: 'checksum',
    role,
    confidence: 0.9,
    evidence: [],
    status: 'ACCEPTED',
    reason: '',
    extractedFrom: null,
  }
}

function bytesToLatin1(bytes: Uint8Array) {
  let out = ''
  for (let index = 0; index < bytes.length; index += 1) out += String.fromCharCode(bytes[index])
  return out
}

/**
 * El caso que de verdad cierra la arquitectura: tres instrumentos distintos —
 * uno con resultados completos (gráfico + tabla + confianza real), uno
 * descriptivo fuera de rango normativo (tiene resultados pero no aplican
 * normativamente) y uno sin ninguna respuesta puntuable (estado vacío
 * compacto, no seis ceros) — verificados con los mismos valores en Paso 7,
 * la vista previa y el PDF. Si diverge en cualquiera de los tres, esta
 * prueba lo revienta antes de producción.
 */
describe('tres instrumentos, un mismo resultado en Paso 7 / preview / PDF', () => {
  it('representa resultados completos, descriptivos sin norma y sin respuestas de forma idéntica en los tres destinos', async () => {
    const staiEntry = createEvaluationInstrument({
      instrumentId: 'pkg-stai',
      name: 'STAI',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Dra. Real',
    })
    const staiPkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    staiPkg.id = 'pkg-stai'
    staiPkg.name = 'STAI'
    staiPkg.files = [acceptedFile('cuadernillo-stai.pdf', 'QUESTION_BOOKLET'), acceptedFile('manual-stai.pdf', 'MANUAL')]
    staiPkg.computedResults = [
      { measureId: 'estado', label: 'Ansiedad estado', rawValue: '38', transformedValue: null, percentile: 65, classification: 'Medio', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!B2', confidence: 0.87 },
      { measureId: 'rasgo', label: 'Ansiedad rasgo', rawValue: '44', transformedValue: null, percentile: 78, classification: 'Alto', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!C2', confidence: 0.83 },
    ]

    // ENFEN es normativo sólo entre 6 y 12 años; a los 27 queda fuera de
    // rango pero conserva resultados descriptivos verificables.
    const enfenEntry = createEvaluationInstrument({
      instrumentId: 'pkg-enfen',
      name: 'ENFEN',
      order: 2,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Dra. Real',
    })
    const enfenPkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    enfenPkg.id = 'pkg-enfen'
    enfenPkg.name = 'ENFEN'
    enfenPkg.files = [acceptedFile('cuadernillo-enfen.pdf', 'QUESTION_BOOKLET')]
    enfenPkg.computedResults = [
      { measureId: 'fluidez', label: 'Fluidez verbal', rawValue: '5', transformedValue: null, percentile: null, classification: null, sourceFile: 'ENFEN.pdf', sourceLocation: null, confidence: 0.7 },
      { measureId: 'interferencia', label: 'Interferencia', rawValue: '8', transformedValue: null, percentile: null, classification: null, sourceFile: 'ENFEN.pdf', sourceLocation: null, confidence: 0.65 },
    ]

    // BENDER no declara rango normativo, pero aquí no tiene ninguna
    // respuesta digitalizada: NO_RESULTS puro.
    const benderEntry = createEvaluationInstrument({
      instrumentId: 'pkg-bender',
      name: 'BENDER',
      order: 3,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Dra. Real',
    })
    const benderPkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    benderPkg.id = 'pkg-bender'
    benderPkg.name = 'BENDER'
    benderPkg.files = [
      acceptedFile('cuadernillo-bender.pdf', 'QUESTION_BOOKLET'),
      acceptedFile('manual-bender.pdf', 'MANUAL'),
      acceptedFile('hoja-bender.pdf', 'ANSWER_SHEET'),
    ]

    evaluation = makeEvaluation({
      initialData: {
        ...makeEvaluation().initialData,
        person: { ...makeEvaluation().initialData.person, birthDate: '1998-12-16' },
        evaluationDate: '2026-09-02',
      },
      battery: [staiEntry, enfenEntry, benderEntry],
      instrumentPackages: [staiPkg, enfenPkg, benderPkg],
    })

    // El EvaluationAnalytics conocido: de aquí salen los valores esperados,
    // no de una predicción sobre reglas de negocio internas.
    const analytics = buildEvaluationAnalytics(evaluation)
    expect(analytics.instruments).toHaveLength(3)
    const byName = Object.fromEntries(analytics.instruments.map((instrument) => [instrument.name, instrument]))
    const stai = byName.STAI
    const enfen = byName.ENFEN
    const bender = byName.BENDER

    // Las tres cifras deben ser, ante todo, tres casos genuinamente distintos.
    expect(new Set([stai.status, enfen.status, bender.status]).size).toBe(3)
    expect(analytics.overviewCharts.map((chart) => chart.type)).toEqual([
      'gauge',
      'flow',
      'matrix',
      'stacked',
      'percentile',
      'stacked',
    ])
    expect(analytics.overviewCharts.map((chart) => chart.title)).toEqual([
      'Preparación para interpretación',
      'Trazabilidad del procesamiento',
      'Matriz de evidencia clínica',
      'Distribución de resultados por instrumento',
      'Señales de calidad del dato',
      'Aplicabilidad normativa',
    ])

    expect(stai.charts[0]?.type).toBe('percentile')
    expect(stai.averageConfidencePct).toBe(85)

    expect(enfen.applicabilityLabel).toBe('No aplicable normativamente')
    expect(enfen.statusLabel).toBe('Resultados descriptivos disponibles')

    expect(bender.statusLabel).toBe('Digitalizado sin respuestas puntuables')
    expect(bender.charts).toHaveLength(0)
    expect(bender.materials).toHaveLength(3)

    const benderConfidenceText = '—' // sin resultados, sin confianza que promediar
    const benderFallbackText = `3 materiales procesados · 0 respuestas detectadas.`

    // --- Paso 7: cada instrumento vive en su propia pestaña ---
    const step7 = render(<ResultsStep />)
    fireEvent.click(screen.getByRole('tab', { name: /STAI/ }))
    expect(screen.getAllByText('85%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ansiedad estado').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: /ENFEN/ }))
    expect(screen.getAllByText(enfen.applicabilityLabel).length).toBeGreaterThan(0)
    expect(screen.getAllByText(enfen.statusLabel).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: /BENDER/ }))
    expect(screen.getAllByText(bender.statusLabel).length).toBeGreaterThan(0)
    expect(screen.getByText('Sin resultados puntuables')).toBeTruthy()
    expect(screen.getByText(benderFallbackText)).toBeTruthy()
    expect(screen.getAllByText(benderConfidenceText).length).toBeGreaterThan(0)
    step7.unmount()
    cleanup()

    // --- Vista previa: los tres instrumentos aparecen a la vez ---
    const document = buildReport(evaluation)
    const preview = render(<ReportPreview document={document} />)
    expect(screen.getAllByText('85%').length).toBeGreaterThan(0)
    expect(screen.getAllByText(enfen.applicabilityLabel).length).toBeGreaterThan(0)
    expect(screen.getAllByText(enfen.statusLabel).length).toBeGreaterThan(0)
    expect(screen.getAllByText(bender.statusLabel).length).toBeGreaterThan(0)
    expect(screen.getByText('Sin resultados puntuables')).toBeTruthy()
    expect(screen.getByText(benderFallbackText)).toBeTruthy()
    preview.unmount()
    cleanup()

    // --- PDF: mismo ReportDocument, sin recalcular nada ---
    const blob = generatePsychopedagogicalReport(document, {})
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const raw = bytesToLatin1(bytes)
    expect(raw).toContain('(Preparaci')
    expect(raw).toContain('(Trazabilidad del procesamiento)')
    expect(raw).toContain('(Matriz de evidencia cl')
    expect(raw).toContain('(Distribuci')
    expect(raw).toContain('(Se')
    expect(raw).toContain('(Aplicabilidad normativa)')
    expect(raw).toContain('(85%)')
    expect(raw).toContain(`(${enfen.applicabilityLabel})`)
    expect(raw).toContain(`(${enfen.statusLabel})`)
    expect(raw).toContain(`(${bender.statusLabel})`)
    expect(raw).toContain('SIN RESULTADOS PUNTUABLES') // el título de la nota sale en mayúsculas en el PDF
    expect(raw).toContain('3 materiales procesados')
    expect(raw).not.toContain('(Estado de resultados por instrumento)')
    expect(raw).not.toContain('(Flujo de procesamiento)')
    expect(raw).not.toContain('(Calidad de datos disponibles)')
  })
})
