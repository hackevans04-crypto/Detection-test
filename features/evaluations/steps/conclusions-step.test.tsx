// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConclusionsStep } from '@/features/evaluations/steps/conclusions-step'
import {
  buildConclusionEvidence,
  sanitizeAreaFinding,
  sanitizeDemographicField,
  sanitizeEvaluationReason,
  sanitizeEvidenceField,
  sanitizeInstrumentResult,
} from '@/lib/evaluations/conclusion-evidence'
import { createEvaluationInstrument, type Evaluation } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { createInstrumentPackage } from '@/lib/instruments/import/package-model'

let evaluation: Evaluation = makeEvaluation()
const saveNow = vi.fn(async () => evaluation)
const goToStep = vi.fn()

const update = vi.fn((mutate: (evaluation: Evaluation) => Evaluation) => {
  evaluation = mutate(evaluation)
})

vi.mock('@/features/evaluations/workspace/evaluation-provider', () => ({
  useEvaluation: () => ({
    evaluation,
    update,
    saveNow,
    saveState: 'idle',
    saveError: null,
    lastSavedAt: null,
    dirty: false,
    goToStep,
  }),
}))

vi.mock('@/features/evaluations/workspace/step-footer', () => ({
  StepFooter: ({ disableNext }: { disableNext?: boolean }) => (
    <div data-testid="step-footer" data-disabled={disableNext ? 'true' : 'false'} />
  ),
}))

afterEach(() => {
  cleanup()
  evaluation = makeEvaluation()
  update.mockClear()
  saveNow.mockClear()
  goToStep.mockClear()
})

describe('ConclusionsStep', () => {
  it('muestra borradores AI automaticos sin contarlos como aceptados', () => {
    evaluation = evaluationWithResults()

    render(<ConclusionsStep />)

    expect(screen.getByText('Conclusiones profesionales')).toBeTruthy()
    expect(screen.getByText(/Detection AI preparo 1 borradores/)).toBeTruthy()
    expect(screen.getByText(/Borrador IA/)).toBeTruthy()
    expect(screen.getByTestId('step-footer').dataset.disabled).toBe('true')
    expect(document.querySelector('.dt-ai-draft-card')).toBeTruthy()
    expect(evaluation.conclusions).toHaveLength(1)
    expect(evaluation.conclusions[0].status).toBe('AI_DRAFT')
  })

  it('aceptar un borrador habilita continuar y conserva evidenceRefs', () => {
    evaluation = evaluationWithResults()
    const view = render(<ConclusionsStep />)

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    view.rerender(<ConclusionsStep />)

    expect(evaluation.conclusions).toHaveLength(1)
    expect(evaluation.conclusions[0].status).toBe('ACCEPTED')
    expect(evaluation.conclusions[0].evidenceRefs?.length).toBeGreaterThan(0)
    expect(screen.getByTestId('step-footer').dataset.disabled).toBe('false')
  })

  it('editar un borrador lo deja aceptado como texto asistido por AI', () => {
    evaluation = evaluationWithResults()
    const view = render(<ConclusionsStep />)

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Texto de la conclusion'), {
      target: { value: 'Conclusion editada por el profesional.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y aceptar' }))
    view.rerender(<ConclusionsStep />)

    expect(evaluation.conclusions[0]).toMatchObject({
      text: 'Conclusion editada por el profesional.',
      source: 'AI_ASSISTED',
      status: 'EDITED_ACCEPTED',
    })
    expect(screen.getByTestId('step-footer').dataset.disabled).toBe('false')
  })

  it('descartar no completa el paso', () => {
    evaluation = evaluationWithResults()
    const view = render(<ConclusionsStep />)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    view.rerender(<ConclusionsStep />)

    expect(evaluation.conclusions[0].status).toBe('DISCARDED')
    expect(screen.getByTestId('step-footer').dataset.disabled).toBe('true')
  })

  it('reload con misma evidencia no duplica borradores', () => {
    evaluation = evaluationWithResults()
    const view = render(<ConclusionsStep />)
    view.rerender(<ConclusionsStep />)

    expect(evaluation.conclusions.filter((entry) => entry.status === 'AI_DRAFT')).toHaveLength(1)
  })

  it('excluye campos basura de la evidencia limpia', () => {
    expect(sanitizeDemographicField('44 · ukhj')).toBeNull()
    expect(sanitizeEvaluationReason('rthtrt')).toBeNull()

    const dirty = evaluationWithResults()
    dirty.initialData.person.grade = '44 · ukhj'
    dirty.referral.reason = 'rthtrt'

    const evidence = buildConclusionEvidence(dirty)
    expect(evidence.context.join(' ')).not.toContain('44')
    expect(evidence.context.join(' ')).not.toContain('rthtrt')
  })

  it('genera borradores con areas reales aunque no haya bundle instrumental puntuable', () => {
    evaluation = makeEvaluation({ instrumentPackages: [], battery: [], conclusions: [] })
    evaluation.functionalAreas['conocimiento-corporal'].performance = 'En desarrollo'
    evaluation.functionalAreas['dominancia-lateral'].performance = 'Dificultad marcada'
    evaluation.functionalAreas.orientacion.performance = 'Adecuado'

    const evidence = buildConclusionEvidence(evaluation)

    expect(evidence.debug.bundleStatus).toBe('READY_SUFFICIENT')
    expect(evidence.debug.signals.evaluatedAreas).toBe(3)
    expect(evidence.suggestedConclusions.length).toBeGreaterThanOrEqual(1)
    expect(evidence.suggestedConclusions[0].sourceRefs).toContain('Areas evaluadas')
  })

  it('mantiene textos evaluativos cortos validos y descarta basura solo en campos libres estrictos', () => {
    expect(sanitizeAreaFinding('Orientación')).toBe('Orientación')
    expect(sanitizeAreaFinding('En desarrollo')).toBe('En desarrollo')
    expect(sanitizeAreaFinding('Dificultad marcada')).toBe('Dificultad marcada')
    expect(sanitizeAreaFinding('Motricidad fina')).toBe('Motricidad fina')
    expect(sanitizeInstrumentResult('STAI')).toBe('STAI')
    expect(sanitizeInstrumentResult('MACI')).toBe('MACI')
    expect(sanitizeEvidenceField('44 · ukhj')).toBeNull()
  })
})

function evaluationWithResults() {
  const entry = createEvaluationInstrument({
    instrumentId: 'pkg-stai',
    name: 'STAI',
    order: 1,
    applicationMode: 'IMPORTED',
    professionalId: 'prof',
    professionalName: 'Profesional',
  })
  const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
  pkg.id = 'pkg-stai'
  pkg.name = 'STAI'
  pkg.readiness = 'READY'
  pkg.stage = 'REVIEW'
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
      evidence: ['Tipo: hoja de calculo'],
      status: 'ACCEPTED',
      reason: '',
      extractedFrom: 'archive-1',
    },
  ]
  pkg.computedResults = [
    {
      measureId: 'estado',
      label: 'Ansiedad estado',
      rawValue: '42',
      transformedValue: 'T60',
      percentile: 75,
      classification: 'Promedio alto',
      sourceFile: 'AUTOMATIZADO.xls',
      sourceLocation: 'Resultados!B2',
      confidence: 0.88,
    },
  ]

  return makeEvaluation({ battery: [entry], instrumentPackages: [pkg], conclusions: [] })
}
