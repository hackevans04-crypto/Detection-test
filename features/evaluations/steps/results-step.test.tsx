// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ResultsStep } from '@/features/evaluations/steps/results-step'
import { createEvaluationInstrument, type Evaluation } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { createInstrumentPackage } from '@/lib/instruments/import/package-model'

let evaluation: Evaluation = makeEvaluation()
const update = vi.fn()

vi.mock('@/features/evaluations/workspace/evaluation-provider', () => ({
  useEvaluation: () => ({
    evaluation,
    update,
    saveNow: vi.fn(),
    saveState: 'idle',
    saveError: null,
    lastSavedAt: null,
    dirty: false,
    goToStep: vi.fn(),
  }),
}))

vi.mock('@/features/evaluations/workspace/step-footer', () => ({
  StepFooter: ({ step }: { step: string }) => <div data-testid="step-footer">{step}</div>,
}))

afterEach(() => {
  cleanup()
  update.mockClear()
  evaluation = makeEvaluation()
})

describe('ResultsStep', () => {
  it('muestra cierre funcional con limitaciones cuando Instrumentos IA procesó material sin respuestas', () => {
    const entry = createEvaluationInstrument({
      instrumentId: 'pkg-enfen',
      name: 'ENFEN',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Dra. Real',
    })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-enfen'
    pkg.name = 'ENFEN'
    pkg.readiness = 'READY'
    pkg.stage = 'REVIEW'
    pkg.files = [
      {
        id: 'file-1',
        path: 'ENFEN/manual.pdf',
        name: 'manual.pdf',
        extension: '.pdf',
        declaredMime: 'application/pdf',
        detectedMime: 'application/pdf',
        size: 2048,
        checksum: 'checksum',
        role: 'MANUAL',
        confidence: 0.9,
        evidence: ['Tipo: manual'],
        status: 'ACCEPTED',
        reason: '',
        extractedFrom: 'archive-1',
      },
    ]

    evaluation = makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })

    render(<ResultsStep />)

    expect(screen.getByText('Cierre con limitaciones')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Lectura ejecutiva del expediente' })).toBeTruthy()
    expect(screen.getByText('Indicadores clínicos')).toBeTruthy()
    expect(screen.getByText('Trazabilidad del procesamiento')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Instrumento digitalizado sin aplicación completada' })).toBeTruthy()
    expect(screen.getByText('materiales incorporados')).toBeTruthy()
    expect(screen.queryByText('Todavía no hay resultados disponibles')).toBeNull()
  })

  it('consume bundles reales producidos por Instrumentos IA sin reimportar archivos', () => {
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
    pkg.readiness = 'PARTIAL_READY'
    pkg.stage = 'REVIEW'
    pkg.computedResults = [
      {
        measureId: 'stai-estado',
        label: 'Ansiedad estado',
        rawValue: '42',
        transformedValue: null,
        percentile: null,
        classification: null,
        sourceFile: 'AUTOMATIZADO.xls',
        sourceLocation: 'Resultados!B2',
        confidence: 0.82,
      },
    ]
    pkg.files = [
      {
        id: 'file-1',
        path: 'STAI/AUTOMATIZADO.xls',
        name: 'AUTOMATIZADO.xls',
        extension: '.xls',
        declaredMime: 'application/vnd.ms-excel',
        detectedMime: 'application/vnd.ms-excel',
        size: 2048,
        checksum: 'checksum',
        role: 'AUTOMATED_SPREADSHEET',
        confidence: 0.9,
        evidence: ['Tipo: hoja de cálculo'],
        status: 'ACCEPTED',
        reason: '',
        extractedFrom: 'archive-1',
      },
    ]

    evaluation = makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })

    render(<ResultsStep />)

    expect(screen.getByText('1 bundle recibido')).toBeTruthy()
    expect(screen.getByText('Resultados transferidos desde Instrumentos IA. Paso 7 consolida; no vuelve a importar archivos.')).toBeTruthy()
    expect(screen.getAllByText('Ansiedad estado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/AUTOMATIZADO\.xls/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Todavía no hay resultados disponibles')).toBeNull()

    // La confianza (0.82) viene de pkg.computedResults[0].confidence, no de un valor inventado.
    expect(screen.getByRole('heading', { name: 'Lectura ejecutiva del expediente' })).toBeTruthy()
    expect(screen.getByText('Calidad del dato')).toBeTruthy()
    expect(screen.getByText('Preparación para interpretación')).toBeTruthy()
    expect(screen.getByText('Trazabilidad del procesamiento')).toBeTruthy()
    expect(screen.getAllByText('82%').length).toBeGreaterThan(0)
  })

  it('colapsa varias limitaciones detrás de un contador, en vez de apilar avisos', () => {
    // BENDER (validación profesional pendiente) y ENFEN (fuera de rango para un
    // adulto) producen dos textos de limitación distintos a esta edad — se
    // verificó en un informe real generado en esta misma sesión.
    const benderEntry = createEvaluationInstrument({
      instrumentId: 'pkg-bender',
      name: 'BENDER',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Dra. Real',
    })
    const benderPkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    benderPkg.id = 'pkg-bender'
    benderPkg.name = 'BENDER'
    benderPkg.stage = 'REVIEW'
    benderPkg.files = [acceptedManualFile('bender-manual.pdf')]

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
    enfenPkg.stage = 'REVIEW'
    enfenPkg.files = [acceptedManualFile('enfen-manual.pdf')]

    evaluation = makeEvaluation({
      initialData: {
        ...makeEvaluation().initialData,
        person: { ...makeEvaluation().initialData.person, birthDate: '1998-12-16' },
        evaluationDate: '2026-09-02',
      },
      battery: [benderEntry, enfenEntry],
      instrumentPackages: [benderPkg, enfenPkg],
    })

    render(<ResultsStep />)

    const toggle = screen.getByText(/limitaciones detectadas · Ver detalles/)
    expect(toggle).toBeTruthy()
    expect(screen.queryByText('Sin interpretación normativa completa disponible.')).toBeNull()

    fireEvent.click(toggle.closest('button')!)

    expect(screen.getByText('Sin interpretación normativa completa disponible.')).toBeTruthy()
    expect(screen.getByText(/fuera del rango normativo/)).toBeTruthy()
  })
})

function acceptedManualFile(name: string) {
  return {
    id: `file-${name}`,
    path: name,
    name,
    extension: '.pdf',
    declaredMime: 'application/pdf',
    detectedMime: 'application/pdf',
    size: 2048,
    checksum: 'checksum',
    role: 'MANUAL' as const,
    confidence: 0.9,
    evidence: ['Tipo: manual'],
    status: 'ACCEPTED' as const,
    reason: '',
    extractedFrom: null,
  }
}
