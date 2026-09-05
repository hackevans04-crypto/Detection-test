import type { InstrumentBlueprint, InstrumentIngestionJob, InstrumentIngestionStatus } from '@/lib/evaluations/model'

/**
 * Etapas visibles del procesamiento de un instrumento incorporado.
 *
 * Cinco, no quince. El detalle técnico de cada paso -clasificación del
 * documento, extracción, mapeo de campos- queda detrás de «Ver detalles»: al
 * profesional le importa dónde va el proceso y si puede aplicar el instrumento,
 * no cómo está construido el procesamiento.
 */

export const ingestionStages = [
  { id: 'recepcion', label: 'Archivo recibido' },
  { id: 'identificacion', label: 'Identificación' },
  { id: 'estructuracion', label: 'Estructuración' },
  { id: 'validacion', label: 'Validación' },
  { id: 'preparacion', label: 'Preparación' },
] as const

export type IngestionStageId = (typeof ingestionStages)[number]['id']
export type StageState = 'done' | 'active' | 'pending' | 'stopped'

export type IngestionStage = {
  id: IngestionStageId
  label: string
  state: StageState
}

/** Cuántas etapas quedan completas en cada estado del job. */
const reachedByStatus: Record<InstrumentIngestionStatus, number> = {
  UPLOADED: 1,
  CLASSIFYING: 1,
  EXTRACTING: 2,
  STRUCTURING: 2,
  VALIDATING: 3,
  READY_FOR_REVIEW: 4,
  APPROVED: 5,
  UNIDENTIFIED: 1,
  FAILED: 0,
}

const stoppedStatuses: InstrumentIngestionStatus[] = ['FAILED', 'UNIDENTIFIED']

export function ingestionStagesFor(job: InstrumentIngestionJob): IngestionStage[] {
  const reached = reachedByStatus[job.status] ?? 0
  const stopped = stoppedStatuses.includes(job.status)

  return ingestionStages.map((stage, index) => {
    if (index < reached) return { ...stage, state: 'done' as const }
    if (index === reached) return { ...stage, state: stopped ? ('stopped' as const) : ('active' as const) }
    return { ...stage, state: 'pending' as const }
  })
}

export type IngestionOutcome = {
  /** Estado del instrumento, en los términos en que el profesional decide. */
  label: string
  tone: 'success' | 'warning' | 'danger'
  /** Qué puede hacer ahora. Vacío cuando no hay nada accionable. */
  detail: string
}

/**
 * Lectura profesional del resultado. Nunca dice «Listo» mientras queden reglas
 * de corrección sin validar: un instrumento a medias que se aplica produce
 * resultados que nadie puede defender.
 */
export function ingestionOutcome(job: InstrumentIngestionJob, blueprint: InstrumentBlueprint | null): IngestionOutcome {
  if (job.status === 'FAILED') {
    return {
      label: 'Procesamiento detenido',
      tone: 'danger',
      detail: 'No fue posible completar el procesamiento del archivo.',
    }
  }

  if (job.status === 'UNIDENTIFIED') {
    return {
      label: 'Sin identificar',
      tone: 'warning',
      detail: 'No fue posible identificar el instrumento con suficiente precisión.',
    }
  }

  if (job.status === 'APPROVED' && blueprint?.status === 'VALIDATED') {
    return {
      label: 'Listo para aplicación',
      tone: 'success',
      detail: 'Instrumento preparado para aplicación.',
    }
  }

  if (job.status === 'READY_FOR_REVIEW') {
    return {
      label: 'Revisión requerida',
      tone: 'warning',
      detail: blueprint?.reviewNotes[0]
        ? 'Se identificó la estructura del instrumento, pero existen reglas de corrección que requieren validación.'
        : 'El instrumento requiere revisión profesional antes de su aplicación.',
    }
  }

  return { label: 'Procesando instrumento', tone: 'warning', detail: '' }
}

/** Resumen corto de lo reconocido. Sólo lo que el blueprint respalda. */
export function blueprintSummary(blueprint: InstrumentBlueprint): string[] {
  const summary: string[] = []
  if (blueprint.authors.length > 0) summary.push(`Autoría: ${blueprint.authors.join(', ')}`)
  if (blueprint.version && blueprint.version !== 'Sin identificar') summary.push(`Versión ${blueprint.version}`)
  summary.push(`${blueprint.requiredFields.length} datos de identificación reconocidos`)
  if (blueprint.status !== 'VALIDATED') summary.push('Reglas de corrección pendientes de validación')
  return summary
}
