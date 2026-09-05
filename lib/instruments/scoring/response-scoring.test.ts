import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument, createInstrumentBlueprint, type BlueprintMeasure } from '@/lib/evaluations/model'
import { createBaremo, confirmBaremo, upsertBaremo, validateBlueprint } from '@/lib/instruments/blueprint-validation'
import { scoreFromExtractedResponses } from '@/lib/instruments/scoring/response-scoring'
import type { ExtractedResponseSet } from '@/lib/instruments/import/package-model'

const measure: BlueprintMeasure = {
  id: 'direct',
  label: 'Puntuación directa',
  kind: 'DIRECT',
  subtestId: null,
  unit: '',
  source: 'BLUEPRINT',
}

describe('response scoring', () => {
  it('produce puntuación directa desde respuestas sin baremo', () => {
    const blueprint = validateBlueprint(
      createInstrumentBlueprint({ sourceJobId: 'pkg', name: 'STAI', shortName: 'STAI', version: '1', measures: [measure], sourceDocument: 'fixture' }),
      { id: 'prof' },
    )
    const entry = createEvaluationInstrument({ instrumentId: 'pkg', name: 'STAI', order: 1, applicationMode: 'IMPORTED', professionalId: 'prof', professionalName: 'Profesional' })
    const scored = scoreFromExtractedResponses(blueprint, entry, responseSet())

    expect(scored.entry.scores.direct.value).toBe('6')
    expect(scored.results?.status).toBe('RAW_READY')
  })

  it('produce resultado normativo si existe baremo confirmado', () => {
    let blueprint = validateBlueprint(
      createInstrumentBlueprint({ sourceJobId: 'pkg', name: 'STAI', shortName: 'STAI', version: '1', measures: [measure], sourceDocument: 'fixture' }),
      { id: 'prof' },
    )
    const baremo = createBaremo({ sourceMeasureId: 'direct', scope: 'fixture' })
    blueprint = upsertBaremo(blueprint, {
      ...baremo,
      bands: [{ id: 'b1', min: 6, max: 6, scaledValue: 50, percentile: 55, classification: 'Promedio' }],
    })
    blueprint = confirmBaremo(blueprint, baremo.id, { id: 'prof' })
    const entry = createEvaluationInstrument({ instrumentId: 'pkg', name: 'STAI', order: 1, applicationMode: 'IMPORTED', professionalId: 'prof', professionalName: 'Profesional' })
    const scored = scoreFromExtractedResponses(blueprint, entry, responseSet())

    expect(scored.results?.status).toBe('NORMATIVE_READY')
    expect(scored.results?.scoreResult?.overall).toMatchObject({ rawScore: 6, percentile: 55, classification: 'Promedio' })
  })
})

function responseSet(): ExtractedResponseSet {
  return {
    instrumentId: 'STAI',
    sourceFiles: ['respuestas.xlsx'],
    totalItemsExpected: 3,
    totalItemsExtracted: 3,
    completionRate: 1,
    responses: [1, 2, 3].map((value) => ({
      itemId: String(value),
      rawValue: String(value),
      normalizedValue: String(value),
      sourceFile: 'respuestas.xlsx',
      sourceLocation: null,
      confidence: 0.9,
      status: 'EXTRACTED',
    })),
    warnings: [],
  }
}
