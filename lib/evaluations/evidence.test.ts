import { describe, expect, it } from 'vitest'
import { evaluationEvidence, type EvidenceGroup } from '@/lib/evaluations/evidence'
import { makeApplication, makeEvaluation } from '@/lib/evaluations/test-factory'
import type { Evaluation } from '@/lib/evaluations/model'

function group(groups: EvidenceGroup[], id: string) {
  const found = groups.find((item) => item.id === id)
  if (!found) throw new Error(`No existe el grupo de evidencia «${id}».`)
  return found
}

function item(groups: EvidenceGroup[], id: string, label: string) {
  const found = group(groups, id).items.find((entry) => entry.label === label)
  if (!found) throw new Error(`No existe el dato «${label}» en «${id}».`)
  return found
}

/** Áreas funcionales con el desempeño indicado en cada una. */
function withAreas(performances: Partial<Record<keyof Evaluation['functionalAreas'], string>>) {
  const base = makeEvaluation()
  const functionalAreas = { ...base.functionalAreas }
  for (const [id, performance] of Object.entries(performances)) {
    const key = id as keyof Evaluation['functionalAreas']
    functionalAreas[key] = { ...functionalAreas[key], performance: performance as never }
  }
  return makeEvaluation({ functionalAreas })
}

describe('resumen de evidencia', () => {
  it('reúne identificación y motivo aunque el resto esté vacío', () => {
    const evidence = evaluationEvidence(makeEvaluation())

    expect(item(evidence, 'datos', 'Evaluado').value).toContain('Evaluado de prueba')
    expect(item(evidence, 'datos', 'Motivo de evaluación').value).toBe('Motivo de prueba.')
    expect(item(evidence, 'antecedentes', 'Secciones documentadas').tone).toBe('warning')
  })

  it('no inventa conclusiones: la interpretación vacía se declara pendiente', () => {
    const evidence = evaluationEvidence(makeEvaluation())
    const reading = item(evidence, 'interpretacion', 'Lectura global')

    expect(reading.value).toBe('Pendiente de redactar.')
    expect(reading.tone).toBe('warning')
  })

  it('separa las áreas con dificultad de las adecuadas', () => {
    const evidence = evaluationEvidence(
      withAreas({ 'motricidad-fina': 'Dificultad marcada', 'dominancia-lateral': 'Adecuado' }),
    )

    const difficulty = item(evidence, 'areas', 'Áreas con dificultad')
    expect(difficulty.value).toContain('Motricidad fina')
    expect(difficulty.value).not.toContain('Dominancia lateral')
    expect(difficulty.tone).toBe('danger')
    expect(item(evidence, 'areas', 'Áreas adecuadas').value).toContain('Dominancia lateral')
  })

  it('marca el desempeño bajo sólo cuando el instrumento tiene escala', () => {
    // Test ABC puntúa de 0 a 3: 0 y 1 quedan en el tercio inferior; 3 no.
    const evaluation = makeEvaluation({
      instrumentApplications: {
        'test-abc': makeApplication('test-abc', {
          'abc-1': { pd: '0' },
          'abc-2': { pd: '3' },
        }),
      },
    })

    const weakest = item(evaluationEvidence(evaluation), 'test-abc', 'Menor desempeño')
    expect(weakest.value).toContain('Coordinación visomotora')
    expect(weakest.value).not.toContain('Memoria inmediata')
  })

  it('no clasifica una PD de PRO-CÁLCULO sin tabla normativa', () => {
    const evaluation = makeEvaluation({
      instrumentApplications: {
        'pro-calculo': makeApplication('pro-calculo', { 'pc-1': { pd: '0' } }),
      },
    })

    const evidence = evaluationEvidence(evaluation)
    expect(group(evidence, 'pro-calculo').items.some((entry) => entry.label === 'Menor desempeño')).toBe(false)
  })

  it('avisa de que el resultado global no está calculado si falta registro', () => {
    const evaluation = makeEvaluation({
      instrumentApplications: { 'test-abc': makeApplication('test-abc', { 'abc-1': { pd: '2' } }) },
    })

    const result = item(evaluationEvidence(evaluation), 'test-abc', 'Resultado')
    expect(result.value).toContain('1 de 8')
    expect(result.tone).toBe('warning')
  })

  it('incluye la interpretación de cada instrumento cuando se ha escrito', () => {
    const application = makeApplication('test-abc', { 'abc-1': { pd: '2' } })
    const evaluation = makeEvaluation({
      instrumentApplications: {
        'test-abc': { ...application, interpretation: 'Lectura del instrumento.' },
      },
    })

    expect(item(evaluationEvidence(evaluation), 'test-abc', 'Interpretación del instrumento').value).toBe(
      'Lectura del instrumento.',
    )
  })
})
