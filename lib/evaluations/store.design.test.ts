// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const designId = '35418c91-ad0c-451e-af56-2ab77382c0b2'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  window.sessionStorage?.clear?.()
  window.localStorage?.clear?.()
})

describe('DesignEvaluationStore', () => {
  it('carga el expediente de diseño sin consultar backend ni requerir DB', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { DESIGN_MODE, getEvaluation } = await import('@/lib/evaluations/store')

    const evaluation = await getEvaluation(designId)

    expect(DESIGN_MODE).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(evaluation?.initialData.person.fullName).toBe('Christopher Alexander Andino Medina')
    expect(evaluation?.code).toBe('EV-2026-0001')
  })

  it('guarda cambios durante la sesión de diseño', async () => {
    const { getEvaluation, updateEvaluation } = await import('@/lib/evaluations/store')

    await updateEvaluation(designId, (evaluation) => ({
      ...evaluation,
      referral: { ...evaluation.referral, reason: 'Motivo editado en diseño.' },
    }))

    const saved = await getEvaluation(designId)
    expect(saved?.referral.reason).toBe('Motivo editado en diseño.')
  })

  it('mantiene navegación y batería disponibles desde el repositorio', async () => {
    const { evaluationRepository, setCurrentStep } = await import('@/lib/evaluations/store')

    const evaluation = await setCurrentStep(designId, 'areas')
    const instruments = await evaluationRepository.listInstruments(designId)

    expect(evaluation.currentStep).toBe('areas')
    expect(instruments).toEqual([])
  })
})
