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
      return applications.length > 0 && applications.every((app) => deriveInstrumentStatus(app) === 'COMPLETED')
    }
    case 'resultados':
      return filled(evaluation.interpretation)
    case 'conclusiones':
      return evaluation.conclusions.some((entry) => filled(entry.text))
    case 'recomendaciones':
      return recommendationGroupIds.some((group) =>
        evaluation.recommendations[group].some((entry) => filled(entry.text)),
      )
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
      return selectedApplications(evaluation).length > 0
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
  /** Las ocho etapas de contenido; la novena sólo emite el informe. */
  contentCompleted: number
  contentTotal: number
  contentPercent: number
  pendingSteps: StepId[]
}

export function evaluationProgress(evaluation: Evaluation): EvaluationProgress {
  const completed = stepIds.filter((step) => isStepComplete(evaluation, step))
  const contentSteps = stepIds.filter((step) => step !== 'informe')
  const contentCompleted = contentSteps.filter((step) => isStepComplete(evaluation, step))
  return {
    completedSteps: completed.length,
    totalSteps: stepIds.length,
    percent: Math.round((completed.length / stepIds.length) * 100),
    contentCompleted: contentCompleted.length,
    contentTotal: contentSteps.length,
    contentPercent: Math.round((contentCompleted.length / contentSteps.length) * 100),
    pendingSteps: contentSteps.filter((step) => !isStepComplete(evaluation, step)),
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
  const pending = evaluationProgress(evaluation).pendingSteps
  if (pending.length === 0) return stepLabels.informe
  return stepLabels[pending[0]]
}

export function resumeStep(evaluation: Evaluation): StepId {
  const pending = evaluationProgress(evaluation).pendingSteps
  return pending[0] ?? 'informe'
}
