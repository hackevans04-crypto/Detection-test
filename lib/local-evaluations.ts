import type { EvaluationRecord } from '@/types/psychopedagogy'

export const evaluationsKey = 'detection-test.evaluations.v2'

export function loadEvaluations(): EvaluationRecord[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(evaluationsKey) ?? '[]') as EvaluationRecord[]
  } catch {
    return []
  }
}

export function saveEvaluations(evaluations: EvaluationRecord[]) {
  window.localStorage.setItem(evaluationsKey, JSON.stringify(evaluations))
}

export function upsertEvaluation(evaluation: EvaluationRecord) {
  const evaluations = loadEvaluations()
  const index = evaluations.findIndex((item) => item.id === evaluation.id)
  const next = index >= 0 ? evaluations.map((item) => (item.id === evaluation.id ? evaluation : item)) : [evaluation, ...evaluations]
  saveEvaluations(next)
  return next
}

export function deleteEvaluation(id: string) {
  const next = loadEvaluations().filter((item) => item.id !== id)
  saveEvaluations(next)
  return next
}
