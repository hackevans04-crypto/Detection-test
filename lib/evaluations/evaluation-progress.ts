import { backgroundSchema, isSectionComplete } from '@/lib/evaluations/background-schema'
import { functionalAreaSchema, isAreaComplete } from '@/lib/evaluations/functional-areas'
import {
  recommendationGroupIds,
  type RecommendationGroupId,
  stepIds,
  type Evaluation,
  type StepId,
} from '@/lib/evaluations/model'
import { acceptedConclusions, buildConclusionEvidence, hasValidConclusionEvidence } from '@/lib/evaluations/conclusion-evidence'
import { buildInstrumentResultBundles } from '@/lib/instruments/evaluation-results-aggregator'
import { canCloseStep6, getStep6CompletionState } from '@/lib/instruments/step6-completion'

export type EvaluationStepState = {
  step: number
  id:
    | 'selection'
    | 'initial-data'
    | 'reason'
    | 'context'
    | 'areas'
    | 'instruments'
    | 'results'
    | 'conclusions'
    | 'recommendations'
    | 'final-report'
  status: 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'COMPLETED_WITH_LIMITATIONS'
}

export type StepCompletionState = {
  complete: boolean
  limited: boolean
  reason?: string
}

const stepStateIds: Record<StepId, EvaluationStepState['id']> = {
  'datos-iniciales': 'initial-data',
  motivo: 'reason',
  contexto: 'context',
  areas: 'areas',
  instrumentos: 'instruments',
  resultados: 'results',
  conclusiones: 'conclusions',
  recomendaciones: 'recommendations',
  informe: 'final-report',
}

function filled(value: string | undefined | null) {
  return (value ?? '').trim().length > 0
}

function isAcceptedRecommendation(entry: Evaluation['recommendations'][RecommendationGroupId][number]) {
  if (!filled(entry.text)) return false
  if (entry.status === 'AI_DRAFT' || entry.status === 'DISCARDED' || entry.status === 'STALE') return false
  if (entry.source === 'AI' && !entry.status) return false
  return entry.status === 'ACCEPTED' || entry.status === 'EDITED_ACCEPTED' || entry.source === 'MANUAL' || !entry.status
}

export function getStep7CompletionState(evaluation: Evaluation): StepCompletionState {
  const bundles = buildInstrumentResultBundles(evaluation).filter((bundle) => bundle.results.length > 0)
  const packageResults = evaluation.instrumentPackages.flatMap((pkg) => pkg.computedResults ?? [])
  const responseSets = evaluation.instrumentPackages.flatMap((pkg) => pkg.extractedResponses ?? [])
  const step6State = getStep6CompletionState(evaluation)

  if (filled(evaluation.interpretation)) {
    return { complete: true, limited: false }
  }

  if (bundles.length > 0) {
    const limited = bundles.some((bundle) => bundle.status !== 'NORMATIVE_READY' || bundle.limitations.length > 0)
    return {
      complete: true,
      limited,
      reason: limited ? 'Resultados descriptivos o cierre funcional con limitaciones.' : undefined,
    }
  }

  if (packageResults.length > 0 || responseSets.some((set) => set.responses.length > 0)) {
    return {
      complete: true,
      limited: true,
      reason: 'Resultados importados o respuestas verificables disponibles.',
    }
  }

  if (canCloseStep6(step6State) && step6State.status === 'COMPLETED_WITH_LIMITATIONS') {
    return {
      complete: true,
      limited: true,
      reason: 'Cierre descriptivo del paso 6 aceptado sin respuestas puntuables.',
    }
  }

  return { complete: false, limited: false, reason: 'Sin resultados ni cierre descriptivo disponible.' }
}

export function getStep8CompletionState(evaluation: Evaluation): StepCompletionState {
  const evidenceVersion = buildConclusionEvidence(evaluation).evidenceVersion
  const approvedConclusions = acceptedConclusions(evaluation).filter((entry) =>
    hasValidConclusionEvidence(entry, evidenceVersion),
  )
  return {
    complete: approvedConclusions.length > 0,
    limited: false,
    reason: approvedConclusions.length > 0 ? undefined : 'Sin conclusiones aceptadas.',
  }
}

export function getStep9CompletionState(evaluation: Evaluation): StepCompletionState {
  const total = recommendationGroupIds.reduce(
    (sum, group) => sum + evaluation.recommendations[group].filter(isAcceptedRecommendation).length,
    0,
  )
  return {
    complete: total > 0,
    limited: false,
    reason: total > 0 ? undefined : 'Sin recomendaciones incorporadas.',
  }
}

export function getStepCompletionState(evaluation: Evaluation, step: StepId): StepCompletionState {
  switch (step) {
    case 'datos-iniciales': {
      const { person, evaluationDate } = evaluation.initialData
      const complete =
        filled(person.fullName) &&
        filled(person.birthDate) &&
        filled(person.institution) &&
        filled(person.grade) &&
        filled(evaluationDate)
      return { complete, limited: false }
    }
    case 'motivo':
      return { complete: filled(evaluation.referral.reason) && filled(evaluation.referral.source), limited: false }
    case 'contexto':
      return {
        complete: backgroundSchema.every((section) => isSectionComplete(evaluation.background[section.id] ?? {}, section)),
        limited: false,
      }
    case 'areas':
      return {
        complete: functionalAreaSchema.every((schema) => isAreaComplete(evaluation.functionalAreas[schema.id], schema)),
        limited: false,
      }
    case 'instrumentos': {
      const state = getStep6CompletionState(evaluation)
      return {
        complete: canCloseStep6(state),
        limited: state.status === 'PARTIAL_RESULTS' || state.status === 'COMPLETED_WITH_LIMITATIONS',
        reason: state.limitations[0],
      }
    }
    case 'resultados':
      return getStep7CompletionState(evaluation)
    case 'conclusiones':
      return getStep8CompletionState(evaluation)
    case 'recomendaciones':
      return getStep9CompletionState(evaluation)
    case 'informe':
      return { complete: evaluation.report.status === 'GENERATED', limited: false }
  }
}

export function canNavigateToStep(evaluation: Evaluation, step: StepId) {
  const targetIndex = stepIds.indexOf(step)
  if (targetIndex <= 0) return true

  return getStepCompletionState(evaluation, stepIds[targetIndex - 1]).complete
}

export function getEvaluationProgress(evaluation: Evaluation, activeStep?: StepId): EvaluationStepState[] {
  const states: EvaluationStepState[] = [{ step: 1, id: 'selection', status: 'COMPLETED' }]
  for (const [index, step] of stepIds.entries()) {
    const completion = getStepCompletionState(evaluation, step)
    const available = canNavigateToStep(evaluation, step)
    states.push({
      step: index + 2,
      id: stepStateIds[step],
      status:
        step === activeStep
          ? 'ACTIVE'
          : completion.complete
            ? completion.limited
              ? 'COMPLETED_WITH_LIMITATIONS'
              : 'COMPLETED'
            : available
              ? 'AVAILABLE'
              : 'LOCKED',
    })
  }
  return states
}
