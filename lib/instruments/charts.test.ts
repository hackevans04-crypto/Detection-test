import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument, createInstrumentBlueprint, type BlueprintMeasure } from '@/lib/evaluations/model'
import { confirmBaremo, createBaremo, upsertBaremo, validateBlueprint } from '@/lib/instruments/blueprint-validation'
import { setScore } from '@/lib/instruments/battery'
import { instrumentProfileChart, percentileRows, radarEligible } from '@/lib/instruments/charts'

const measures: BlueprintMeasure[] = [
  { id: 'direct', label: 'Puntuación directa', kind: 'DIRECT', subtestId: null, unit: '', source: 'BLUEPRINT' },
]

function makeBlueprintWithConfirmedBaremo() {
  let blueprint = createInstrumentBlueprint({
    sourceJobId: 'pkg-1',
    name: 'Instrumento de prueba',
    shortName: 'IP',
    version: '1',
    measures,
    sourceDocument: 'manual.pdf',
  })
  blueprint = validateBlueprint(blueprint, { id: 'prof-1' })
  const baremo = createBaremo({ sourceMeasureId: 'direct' })
  blueprint = upsertBaremo(blueprint, {
    ...baremo,
    bands: [
      { id: 'b1', min: 0, max: 10, scaledValue: 40, percentile: 20, classification: 'Bajo' },
      { id: 'b2', min: 11, max: 20, scaledValue: 55, percentile: 60, classification: 'Adecuado' },
    ],
  })
  blueprint = confirmBaremo(blueprint, baremo.id, { id: 'prof-1' })
  return blueprint
}

function makeEntry(blueprintId: string | null) {
  return createEvaluationInstrument({
    instrumentId: 'pkg-1',
    blueprintId,
    name: 'Instrumento de prueba',
    order: 1,
    applicationMode: 'IMPORTED',
    professionalId: 'prof-1',
    professionalName: 'Profesional Uno',
  })
}

describe('instrumentProfileChart con baremo de blueprint', () => {
  it('un instrumento incorporado por paquete (sin catálogo) sí puede tener perfil', () => {
    const blueprint = makeBlueprintWithConfirmedBaremo()
    const entry = setScore(makeEntry(blueprint.id), 'direct', '15')

    const chart = instrumentProfileChart(entry, { [blueprint.id]: blueprint })

    expect(chart.rows).toHaveLength(1)
    expect(chart.rows[0]).toMatchObject({
      value: 15,
      bandLabel: 'Adecuado',
      percentile: 60,
      caption: '15 → 55',
    })
    expect(chart.withoutScale).toBe(0)
  })

  it('sin baremo confirmado, la medida cuenta como sin escala en vez de inventar un rango', () => {
    let blueprint = createInstrumentBlueprint({
      sourceJobId: 'pkg-2',
      name: 'Instrumento sin baremo',
      shortName: 'ISB',
      version: '1',
      measures,
      sourceDocument: 'manual.pdf',
    })
    blueprint = validateBlueprint(blueprint, { id: 'prof-1' })
    const entry = setScore(makeEntry(blueprint.id), 'direct', '15')

    const chart = instrumentProfileChart(entry, { [blueprint.id]: blueprint })

    expect(chart.rows).toHaveLength(0)
    expect(chart.withoutScale).toBe(1)
  })
})

describe('selección de visualización', () => {
  it('el radar sólo se ofrece con al menos tres medidas representables', () => {
    const blueprint = makeBlueprintWithConfirmedBaremo()
    const entry = setScore(makeEntry(blueprint.id), 'direct', '15')
    const chart = instrumentProfileChart(entry, { [blueprint.id]: blueprint })

    expect(radarEligible(chart)).toBe(false)
    expect(radarEligible({ ...chart, rows: [...chart.rows, ...chart.rows, ...chart.rows] })).toBe(true)
  })

  it('percentileRows sólo devuelve filas con percentil declarado', () => {
    const blueprint = makeBlueprintWithConfirmedBaremo()
    const entry = setScore(makeEntry(blueprint.id), 'direct', '15')
    const chart = instrumentProfileChart(entry, { [blueprint.id]: blueprint })

    expect(percentileRows(chart)).toHaveLength(1)
    expect(percentileRows({ ...chart, rows: [{ ...chart.rows[0], percentile: null }] })).toHaveLength(0)
  })
})
