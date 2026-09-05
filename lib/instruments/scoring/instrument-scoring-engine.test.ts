import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument, createInstrumentBlueprint, type BlueprintMeasure } from '@/lib/evaluations/model'
import { validateBlueprint, createBaremo, confirmBaremo, upsertBaremo } from '@/lib/instruments/blueprint-validation'
import { setScore } from '@/lib/instruments/battery'
import { scoreInstrument } from '@/lib/instruments/scoring/instrument-scoring-engine'

const directMeasure: BlueprintMeasure = {
  id: 'direct',
  label: 'Puntuación directa',
  kind: 'DIRECT',
  subtestId: null,
  unit: '',
  source: 'BLUEPRINT',
}

const subtestMeasure: BlueprintMeasure = {
  id: 'subtest-a-direct',
  label: 'Puntuación directa · Subtest A',
  kind: 'DIRECT',
  subtestId: 'subtest-a',
  unit: '',
  source: 'BLUEPRINT',
}

function makeBaseBlueprint(measures: BlueprintMeasure[]) {
  return createInstrumentBlueprint({
    sourceJobId: 'pkg-1',
    name: 'Instrumento de prueba',
    shortName: 'IP',
    version: '1',
    measures,
    sourceDocument: 'manual.pdf',
  })
}

function makeEntry() {
  return createEvaluationInstrument({
    instrumentId: 'pkg-1',
    name: 'Instrumento de prueba',
    order: 1,
    applicationMode: 'IMPORTED',
    professionalId: 'prof-1',
    professionalName: 'Profesional Uno',
  })
}

describe('instrument scoring engine', () => {
  it('no calcula nada sin un blueprint validado', () => {
    const blueprint = makeBaseBlueprint([directMeasure])
    const entry = makeEntry()
    expect(scoreInstrument(blueprint, entry)).toBeNull()
    expect(scoreInstrument(null, entry)).toBeNull()
  })

  it('deja sin baremo las medidas capturadas cuando no hay ninguno confirmado', () => {
    const blueprint = validateBlueprint(makeBaseBlueprint([directMeasure]), { id: 'prof-1' })
    const entry = setScore(makeEntry(), 'direct', '12')

    const result = scoreInstrument(blueprint, entry)
    expect(result).not.toBeNull()
    expect(result!.overall).toBeNull()
    expect(result!.otherMeasures).toEqual([
      expect.objectContaining({ measureId: 'direct', computable: false, reason: 'Sin baremo confirmado para esta medida.' }),
    ])
  })

  it('resuelve la puntuación global contra un baremo confirmado', () => {
    let blueprint = validateBlueprint(makeBaseBlueprint([directMeasure]), { id: 'prof-1' })
    let baremo = createBaremo({ sourceMeasureId: 'direct', scope: 'General' })
    baremo = {
      ...baremo,
      bands: [
        { id: 'b1', min: 0, max: 10, scaledValue: 40, percentile: 20, classification: 'Bajo' },
        { id: 'b2', min: 11, max: 20, scaledValue: 55, percentile: 60, classification: 'Adecuado' },
      ],
    }
    blueprint = upsertBaremo(blueprint, baremo)
    blueprint = confirmBaremo(blueprint, baremo.id, { id: 'prof-1' }, '2026-09-03T10:00:00.000Z')

    const entry = setScore(makeEntry(), 'direct', '15')
    const result = scoreInstrument(blueprint, entry)

    expect(result!.overall).toMatchObject({
      measureId: 'direct',
      rawScore: 15,
      scaledScore: 55,
      percentile: 60,
      classification: 'Adecuado',
      computable: true,
    })
    expect(result!.otherMeasures).toEqual([])
  })

  it('marca no calculable cuando la puntuación no cae en ningún tramo, sin inventar un resultado', () => {
    let blueprint = validateBlueprint(makeBaseBlueprint([directMeasure]), { id: 'prof-1' })
    let baremo = createBaremo({ sourceMeasureId: 'direct' })
    baremo = { ...baremo, bands: [{ id: 'b1', min: 0, max: 10, scaledValue: 40, percentile: 20, classification: 'Bajo' }] }
    blueprint = upsertBaremo(blueprint, baremo)
    blueprint = confirmBaremo(blueprint, baremo.id, { id: 'prof-1' })

    const entry = setScore(makeEntry(), 'direct', '99')
    const result = scoreInstrument(blueprint, entry)

    expect(result!.overall).toMatchObject({
      rawScore: 99,
      scaledScore: null,
      percentile: null,
      classification: null,
      computable: false,
    })
  })

  it('ignora un baremo sin confirmar, igual que si no existiera', () => {
    let blueprint = validateBlueprint(makeBaseBlueprint([directMeasure]), { id: 'prof-1' })
    let baremo = createBaremo({ sourceMeasureId: 'direct' })
    baremo = { ...baremo, bands: [{ id: 'b1', min: 0, max: 20, scaledValue: 50, percentile: 50, classification: 'Adecuado' }] }
    blueprint = upsertBaremo(blueprint, baremo) // nunca confirmado

    const entry = setScore(makeEntry(), 'direct', '15')
    const result = scoreInstrument(blueprint, entry)

    expect(result!.overall).toBeNull()
    expect(result!.otherMeasures[0]).toMatchObject({ measureId: 'direct', computable: false })
  })

  it('separa subescalas de la medida global', () => {
    let blueprint = validateBlueprint(makeBaseBlueprint([directMeasure, subtestMeasure]), { id: 'prof-1' })

    const globalBaremo = createBaremo({ sourceMeasureId: 'direct' })
    blueprint = upsertBaremo(blueprint, {
      ...globalBaremo,
      bands: [{ id: 'g1', min: 0, max: 20, scaledValue: 50, percentile: 50, classification: 'Adecuado' }],
    })
    blueprint = confirmBaremo(blueprint, globalBaremo.id, { id: 'prof-1' })

    const subBaremo = createBaremo({ sourceMeasureId: 'subtest-a-direct' })
    blueprint = upsertBaremo(blueprint, {
      ...subBaremo,
      bands: [{ id: 's1', min: 0, max: 20, scaledValue: 45, percentile: 40, classification: 'En desarrollo' }],
    })
    blueprint = confirmBaremo(blueprint, subBaremo.id, { id: 'prof-1' })

    let entry = setScore(makeEntry(), 'direct', '10')
    entry = setScore(entry, 'subtest-a-direct', '8')

    const result = scoreInstrument(blueprint, entry)
    expect(result!.overall).toMatchObject({ measureId: 'direct', computable: true })
    expect(result!.subscales).toEqual([
      expect.objectContaining({ measureId: 'subtest-a-direct', subtestId: 'subtest-a', computable: true }),
    ])
  })

  it('el mismo blueprint y la misma entrada producen siempre el mismo resultado', () => {
    let blueprint = validateBlueprint(makeBaseBlueprint([directMeasure]), { id: 'prof-1' })
    let baremo = createBaremo({ sourceMeasureId: 'direct' })
    baremo = { ...baremo, bands: [{ id: 'b1', min: 0, max: 20, scaledValue: 50, percentile: 50, classification: 'Adecuado' }] }
    blueprint = upsertBaremo(blueprint, baremo)
    blueprint = confirmBaremo(blueprint, baremo.id, { id: 'prof-1' })
    const entry = setScore(makeEntry(), 'direct', '10')

    const first = scoreInstrument(blueprint, entry)
    const second = scoreInstrument(blueprint, entry)
    expect({ ...first, computedAt: null }).toEqual({ ...second, computedAt: null })
  })
})
