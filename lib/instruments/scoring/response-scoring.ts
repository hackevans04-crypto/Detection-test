import type { EvaluationInstrument, InstrumentBlueprint, ScoreValue } from '@/lib/evaluations/model'
import type { ExtractedResponseSet } from '@/lib/instruments/import/package-model'
import { scoreInstrument, type InstrumentScoreResult } from '@/lib/instruments/scoring/instrument-scoring-engine'

export type InstrumentComputedResults = {
  status: 'RAW_READY' | 'DESCRIPTIVE_READY' | 'NORMATIVE_READY'
  rawScores: Record<string, number>
  scoreResult: InstrumentScoreResult | null
}

export function scoreFromExtractedResponses(
  blueprint: InstrumentBlueprint | null,
  entry: EvaluationInstrument,
  responseSet: ExtractedResponseSet,
): { entry: EvaluationInstrument; results: InstrumentComputedResults | null } {
  if (!blueprint || responseSet.responses.length === 0) return { entry, results: null }
  const directMeasure = blueprint.measures.find((measure) => measure.kind === 'DIRECT') ?? blueprint.measures[0]
  if (!directMeasure) return { entry, results: null }

  const validResponses = responseSet.responses.filter((response) => response.status === 'EXTRACTED')
  const rawTotal = validResponses.reduce((sum, response) => {
    const parsed = Number(response.normalizedValue)
    return Number.isFinite(parsed) ? sum + parsed : sum
  }, 0)

  const scoreValue: ScoreValue = {
    fieldId: directMeasure.id,
    value: String(rawTotal),
    updatedAt: new Date().toISOString(),
  }
  const nextEntry = { ...entry, scores: { ...entry.scores, [directMeasure.id]: scoreValue } }
  const scoreResult = scoreInstrument(blueprint, nextEntry)
  const hasNormative = Boolean(scoreResult?.overall?.computable)

  return {
    entry: nextEntry,
    results: {
      status: hasNormative ? 'NORMATIVE_READY' : 'RAW_READY',
      rawScores: { [directMeasure.id]: rawTotal },
      scoreResult,
    },
  }
}
