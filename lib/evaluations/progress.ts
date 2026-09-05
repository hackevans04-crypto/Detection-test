import { getInstrument } from '@/instruments/catalog'
import { backgroundSchema, isSectionComplete } from '@/lib/evaluations/background-schema'
import { functionalAreaSchema, isAreaComplete } from '@/lib/evaluations/functional-areas'
import {
  recommendationGroupIds,
  stepIds,
  stepLabels,
  type Evaluation,
  type EvaluationStatus,
  type InstrumentApplication,
  type InstrumentApplicationStatus,
  type ReportStatus,
  type StepId,
  type StepStatus,
} from '@/lib/evaluations/model'
import {
  getEvaluationProgress,
  getStepCompletionState,
  type EvaluationStepState,
} from '@/lib/evaluations/evaluation-progress'

function filled(value: string | undefined) {
  return (value ?? '').trim().length > 0
}

/** Campos que el paso 1 marca con asterisco. Se validan en un solo sitio. */
export function missingInitialDataFields(evaluation: Evaluation) {
  const { person, evaluationDate } = evaluation.initialData
  const missing: string[] = []
  if (!filled(person.fullName)) missing.push('Nombres y apellidos')
  if (!filled(person.birthDate)) missing.push('Fecha de nacimiento')
  if (!filled(person.institution)) missing.push('Institución educativa')
  if (!filled(person.grade)) missing.push('Grado o curso')
  if (!filled(evaluationDate)) missing.push('Fecha de evaluación')
  return missing
}

export function missingReferralFields(evaluation: Evaluation) {
  const missing: string[] = []
  if (!filled(evaluation.referral.reason)) missing.push('Motivo de evaluación')
  if (!filled(evaluation.referral.source)) missing.push('Remitente')
  return missing
}

/**
 * Estado de aplicación de un instrumento, derivado de sus registros. Un subtest
 * cuenta como registrado cuando tiene puntuación directa: la observación sola
 * no basta, y en PRO-CÁLCULO la PT puede faltar legítimamente.
 */
export function isSubtestRecorded(application: InstrumentApplication, subtestId: string) {
  return filled(application.entries[subtestId]?.pd)
}

export function instrumentProgress(application: InstrumentApplication) {
  const instrument = getInstrument(application.instrumentId)
  const total = instrument?.subtests.length ?? 0
  if (total === 0) return { recorded: 0, total: 0, percent: 0 }
  const recorded = instrument!.subtests.filter((subtest) => isSubtestRecorded(application, subtest.id)).length
  return { recorded, total, percent: Math.round((recorded / total) * 100) }
}

export function deriveInstrumentStatus(application: InstrumentApplication): InstrumentApplicationStatus {
  const { recorded, total } = instrumentProgress(application)
  if (total > 0 && recorded === total) return 'COMPLETED'
  if (recorded > 0) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

export function selectedApplications(evaluation: Evaluation) {
  return Object.values(evaluation.instrumentApplications)
}

export function isStepComplete(evaluation: Evaluation, step: StepId): boolean {
  switch (step) {
    case 'datos-iniciales':
      return missingInitialDataFields(evaluation).length === 0
    case 'motivo':
      return missingReferralFields(evaluation).length === 0
    case 'contexto':
      // Las intervenciones anteriores no son obligatorias: puede no haberlas.
      return backgroundSchema.every((section) => isSectionComplete(evaluation.background[section.id] ?? {}, section))
    case 'areas':
      return functionalAreaSchema.every((schema) => isAreaComplete(evaluation.functionalAreas[schema.id], schema))
    case 'instrumentos': {
      const applications = selectedApplications(evaluation)
      if (getStepCompletionState(evaluation, step).complete) return true
      return applications.length > 0 && applications.every((app) => deriveInstrumentStatus(app) === 'COMPLETED')
    }
    case 'resultados':
      return getStepCompletionState(evaluation, step).complete
    case 'conclusiones':
      return getStepCompletionState(evaluation, step).complete
    case 'recomendaciones':
      return getStepCompletionState(evaluation, step).complete
    case 'informe':
      return evaluation.report.status === 'GENERATED'
  }
}

/** Un paso está «en progreso» si tiene algo escrito pero aún no cumple el criterio. */
function hasAnyInput(evaluation: Evaluation, step: StepId): boolean {
  switch (step) {
    case 'datos-iniciales':
      return filled(evaluation.initialData.person.fullName)
    case 'motivo':
      return filled(evaluation.referral.reason) || filled(evaluation.referral.source)
    case 'contexto':
      return (
        backgroundSchema.some((section) =>
          Object.values(evaluation.background[section.id] ?? {}).some((value) => filled(value)),
        ) || evaluation.interventions.length > 0
      )
    case 'areas':
      return functionalAreaSchema.some(
        (schema) =>
          evaluation.functionalAreas[schema.id]?.performance !== '' ||
          filled(evaluation.functionalAreas[schema.id]?.description),
      )
    case 'instrumentos':
      return selectedApplications(evaluation).length > 0 || evaluation.battery.length > 0 || evaluation.instrumentPackages.length > 0
    case 'resultados':
      return filled(evaluation.interpretation)
    case 'conclusiones':
      return evaluation.conclusions.length > 0
    case 'recomendaciones':
      return recommendationGroupIds.some((group) => evaluation.recommendations[group].length > 0)
    case 'informe':
      return evaluation.report.status !== 'NOT_READY'
  }
}

export function stepStatus(evaluation: Evaluation, step: StepId): StepStatus {
  if (isStepComplete(evaluation, step)) return 'COMPLETED'
  if (evaluation.currentStep === step || hasAnyInput(evaluation, step)) return 'IN_PROGRESS'
  return 'PENDING'
}

export type StepSummary = {
  id: StepId
  index: number
  label: string
  status: StepStatus
  href: string
}

export function stepSummaries(evaluation: Evaluation): StepSummary[] {
  return stepIds.map((id, index) => ({
    id,
    index,
    label: stepLabels[id],
    status: stepStatus(evaluation, id),
    href: `/evaluaciones/${evaluation.id}/${id}`,
  }))
}

export type EvaluationProgress = {
  completedSteps: number
  totalSteps: number
  percent: number
  /** Etapas de contenido antes de emitir el informe: seleccion + pasos 2-9. */
  contentCompleted: number
  contentTotal: number
  contentPercent: number
  pendingSteps: StepId[]
}

const WORKFLOW_TOTAL = 10
const contentStepIds = stepIds.filter((step) => step !== 'informe')

function isWorkflowStepDone(state: EvaluationStepState) {
  return state.status === 'COMPLETED' || state.status === 'COMPLETED_WITH_LIMITATIONS'
}

export function evaluationProgress(evaluation: Evaluation): EvaluationProgress {
  const workflow = getEvaluationProgress(evaluation)
  const completedWorkflow = workflow.filter(isWorkflowStepDone)
  const pendingSteps = contentStepIds.filter((step) => !getStepCompletionState(evaluation, step).complete)
  const reportGenerated = getStepCompletionState(evaluation, 'informe').complete
  const currentStepNumber =
    reportGenerated || pendingSteps.length === 0
      ? WORKFLOW_TOTAL
      : stepIds.indexOf(pendingSteps[0]) + 2
  const contentCompleted = 1 + contentStepIds.length - pendingSteps.length

  return {
    completedSteps: Math.max(completedWorkflow.length, currentStepNumber),
    totalSteps: WORKFLOW_TOTAL,
    percent: Math.round((currentStepNumber / WORKFLOW_TOTAL) * 100),
    contentCompleted,
    contentTotal: WORKFLOW_TOTAL - 1,
    contentPercent: Math.round((contentCompleted / (WORKFLOW_TOTAL - 1)) * 100),
    pendingSteps,
  }
}

export function deriveReportStatus(evaluation: Evaluation): ReportStatus {
  if (evaluation.report.status === 'GENERATED') return 'GENERATED'
  return evaluationProgress(evaluation).pendingSteps.length === 0 ? 'READY' : 'NOT_READY'
}

export function deriveStatus(evaluation: Evaluation): EvaluationStatus {
  if (evaluation.report.status === 'GENERATED') return 'COMPLETED'
  if (!isStepComplete(evaluation, 'datos-iniciales')) return 'DRAFT'
  return evaluationProgress(evaluation).pendingSteps.length === 0 ? 'READY_FOR_REVIEW' : 'IN_PROGRESS'
}

export const statusLabels: Record<EvaluationStatus, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En proceso',
  READY_FOR_REVIEW: 'Por finalizar',
  COMPLETED: 'Finalizada',
}

/**
 * Texto de la columna «Etapa actual» del listado: el primer paso sin completar,
 * que es donde el profesional debe retomar.
 */
export function currentStageLabel(evaluation: Evaluation) {
  if (evaluation.report.status === 'GENERATED') return 'Finalizada'
  const pending = evaluationProgress(evaluation).pendingSteps
  if (pending.length === 0) return stepLabels.informe
  return stepLabels[pending[0]]
}

export function resumeStep(evaluation: Evaluation): StepId {
  const pending = evaluationProgress(evaluation).pendingSteps
  return pending[0] ?? 'informe'
}
