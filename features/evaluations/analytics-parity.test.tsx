// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ResultsStep } from '@/features/evaluations/steps/results-step'
import { ReportPreview } from '@/features/evaluations/report/report-preview'
import { createEvaluationInstrument, type Evaluation } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { createInstrumentPackage, type PackageFile } from '@/lib/instruments/import/package-model'
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

function acceptedFile(overrides: Partial<PackageFile>): PackageFile {
  return {
    id: crypto.randomUUID(),
    path: overrides.name ?? 'archivo.pdf',
    name: 'archivo.pdf',
    extension: '.pdf',
    declaredMime: 'application/pdf',
    detectedMime: 'application/pdf',
    size: 1024,
    checksum: 'checksum',
    role: 'QUESTION_BOOKLET',
    confidence: 0.9,
    evidence: [],
    status: 'ACCEPTED',
    reason: '',
    extractedFrom: null,
    ...overrides,
  }
}

function bytesToLatin1(bytes: Uint8Array) {
  let out = ''
  for (let index = 0; index < bytes.length; index += 1) out += String.fromCharCode(bytes[index])
  return out
}

/**
 * Esta prueba es la que de verdad cierra la arquitectura: construye un
 * `EvaluationAnalytics` conocido y comprueba que Paso 7, la vista previa y el
 * PDF —los tres consumidores— muestran exactamente los mismos números. Si
 * alguno de los tres vuelve a calcular por su cuenta y diverge, esta prueba
 * revienta antes de que llegue a producción.
 */
describe('paridad Paso 7 == preview == PDF', () => {
  it('el mismo EvaluationAnalytics produce los mismos KPI en los tres destinos', async () => {
    const entry = createEvaluationInstrument({
      instrumentId: 'pkg-stai',
      name: 'STAI',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Dra. Real',
    })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-stai'
    pkg.name = 'STAI'
    pkg.files = [
      acceptedFile({ name: 'cuadernillo.pdf', role: 'QUESTION_BOOKLET' }),
      acceptedFile({ name: 'manual.pdf', role: 'MANUAL' }),
      acceptedFile({ name: 'baremos.pdf', role: 'NORMS' }),
    ]
    pkg.computedResults = [
      { measureId: 'estado', label: 'Ansiedad estado', rawValue: '38', transformedValue: null, percentile: 65, classification: 'Medio', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!B2', confidence: 0.87 },
      { measureId: 'rasgo', label: 'Ansiedad rasgo', rawValue: '44', transformedValue: null, percentile: 78, classification: 'Alto', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!C2', confidence: 0.83 },
    ]

    evaluation = makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })

    // El EvaluationAnalytics conocido: se calcula una sola vez y es la vara de
    // medir para los tres destinos. Si cambian las reglas de negocio, estos
    // valores cambian con ellas — la prueba sigue siendo válida.
    const analytics = buildEvaluationAnalytics(evaluation)
    expect(analytics.summary.processedFiles).toBe(3)
    expect(analytics.summary.resultCount).toBe(2)
    expect(analytics.summary.averageConfidencePct).toBe(85) // (0.87 + 0.83) / 2, no inventado
    expect(analytics.summary.dataQualityPct).toBe(85)
    expect(analytics.overviewCharts.map((chart) => chart.title)).toEqual([
      'Preparación para interpretación',
      'Trazabilidad del procesamiento',
      'Matriz de evidencia clínica',
      'Señales de calidad del dato',
    ])
    expect(analytics.overviewCharts.map((chart) => chart.type)).toEqual(['gauge', 'flow', 'matrix', 'percentile'])

    const confidenceText = `${analytics.summary.averageConfidencePct}%`
    const qualityText = `${analytics.summary.dataQualityPct}%`
    const processedFilesText = String(analytics.summary.processedFiles)
    const resultCountText = String(analytics.summary.resultCount)

    // --- Paso 7 ---
    const step7 = render(<ResultsStep />)
    expect(screen.getByRole('heading', { name: 'Lectura ejecutiva del expediente' })).toBeTruthy()
    expect(screen.getByText('Calidad del dato')).toBeTruthy()
    expect(screen.getByText('Trazabilidad del procesamiento')).toBeTruthy()
    expect(screen.getByText('Señales de calidad del dato')).toBeTruthy()
    expect(screen.getAllByText(qualityText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(confidenceText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(processedFilesText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(resultCountText).length).toBeGreaterThan(0)
    step7.unmount()
    cleanup()

    // --- Vista previa (mismo ReportDocument que consume el PDF) ---
    const document = buildReport(evaluation)
    const preview = render(<ReportPreview document={document} />)
    expect(screen.getByText('Calidad del dato')).toBeTruthy()
    expect(screen.getByText('Trazabilidad del procesamiento')).toBeTruthy()
    expect(screen.getByText('Señales de calidad del dato')).toBeTruthy()
    expect(screen.getAllByText(qualityText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(confidenceText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(processedFilesText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(resultCountText).length).toBeGreaterThan(0)
    preview.unmount()
    cleanup()

    // --- PDF (mismo ReportDocument, sin recalcular nada) ---
    const blob = generatePsychopedagogicalReport(document, {})
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const raw = bytesToLatin1(bytes)
    expect(raw).toContain('(CALIDAD DEL DATO)')
    expect(raw).toContain('(Preparaci')
    expect(raw).toContain('(Trazabilidad del procesamiento)')
    expect(raw).toContain('(Matriz de evidencia cl')
    expect(raw).toContain('(Se')
    expect(raw).toContain(`(${qualityText})`)
    expect(raw).toContain(`(${confidenceText})`)
    expect(raw).toContain(`(${processedFilesText})`)
    expect(raw).toContain(`(${resultCountText})`)
    expect(raw).not.toContain('(Estado de resultados por instrumento)')
    expect(raw).not.toContain('(Flujo de procesamiento)')
    expect(raw).not.toContain('(Calidad de datos disponibles)')
  })
})
