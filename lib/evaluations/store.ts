'use client'

import {
  emptyBackground,
  emptyFunctionalAreas,
  emptyInitialData,
  emptyProfessional,
  emptyRecommendations,
  emptyReferral,
  type Evaluation,
  type InitialData,
  type StepId,
} from '@/lib/evaluations/model'
import { deriveInstrumentStatus, deriveReportStatus, deriveStatus } from '@/lib/evaluations/progress'

/**
 * Único punto de persistencia de la aplicación.
 *
 * Toda la API es asíncrona a propósito. Hoy el almacén es `localStorage`, pero
 * ningún componente lo sabe: reciben promesas y renderizan estados de carga y
 * error reales. Sustituir esto por un backend HTTP es reescribir este fichero,
 * no la aplicación.
 *
 * Los estados derivados (`status`, `report.status`, estado de cada instrumento)
 * se recalculan aquí en cada escritura y nunca en la vista, para que exista una
 * sola autoridad sobre ellos.
 */

const STORAGE_KEY = 'detection-test.evaluations.v4'
/** Formatos anteriores, del más reciente al más antiguo. */
const LEGACY_KEYS = ['detection-test.evaluations.v3', 'detection-test.evaluations.v2']

export class EvaluationStoreError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'EvaluationStoreError'
  }
}

function storage(): Storage {
  if (typeof window === 'undefined') throw new EvaluationStoreError('El almacén sólo está disponible en el navegador.')
  try {
    const probe = '__detection_test_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch (error) {
    throw new EvaluationStoreError(
      'No se pudo acceder al almacenamiento del navegador. Revisa los permisos de datos del sitio.',
      error,
    )
  }
}

/** Recalcula todo lo derivable. Ninguna vista escribe estos campos. */
function reconcile(evaluation: Evaluation): Evaluation {
  const instrumentApplications = Object.fromEntries(
    Object.entries(evaluation.instrumentApplications).map(([id, application]) => {
      const status = deriveInstrumentStatus(application)
      return [
        id,
        {
          ...application,
          status,
          startedAt: application.startedAt ?? (status === 'NOT_STARTED' ? null : new Date().toISOString()),
          completedAt: status === 'COMPLETED' ? application.completedAt ?? new Date().toISOString() : null,
        },
      ]
    }),
  )

  const withApplications: Evaluation = { ...evaluation, instrumentApplications }
  const report = { ...withApplications.report, status: deriveReportStatus(withApplications) }
  const withReport: Evaluation = { ...withApplications, report }
  return { ...withReport, status: deriveStatus(withReport) }
}

/**
 * Completa un expediente leído del almacén con las claves que su versión no
 * tenía. Es lo que permite abrir sin ruido un expediente creado antes de que
 * el modelo creciera.
 */
function hydrate(raw: Partial<Evaluation> & Record<string, unknown>): Evaluation {
  const initialData = { ...emptyInitialData(), ...(raw.initialData ?? {}) } as InitialData
  initialData.person = { ...emptyInitialData().person, ...(raw.initialData?.person ?? {}) }
  initialData.family = { ...emptyInitialData().family, ...(raw.initialData?.family ?? {}) }

  const background = { ...emptyBackground(), ...(raw.background ?? {}) }
  const functionalAreas = { ...emptyFunctionalAreas(), ...(raw.functionalAreas ?? {}) }

  return reconcile({
    id: raw.id ?? crypto.randomUUID(),
    code: raw.code ?? 'EV-SIN-CODIGO',
    evaluatorId: raw.evaluatorId ?? '',
    evaluatorName: raw.evaluatorName ?? '',
    institutionId: raw.institutionId ?? '',
    status: 'DRAFT',
    currentStep: (raw.currentStep as StepId) ?? 'datos-iniciales',
    initialData,
    referral: { ...emptyReferral(), ...(raw.referral ?? {}) },
    background,
    interventions: raw.interventions ?? [],
    functionalAreas,
    instrumentApplications: Object.fromEntries(
      Object.entries(raw.instrumentApplications ?? {}).map(([id, application]) => [
        id,
        { ...application, interpretation: application.interpretation ?? '', ageWarningAcknowledged: application.ageWarningAcknowledged ?? false },
      ]),
    ),
    interpretation: raw.interpretation ?? '',
    conclusions: Array.isArray(raw.conclusions) ? raw.conclusions : [],
    recommendations: { ...emptyRecommendations(), ...(raw.recommendations ?? {}) },
    report: {
      status: 'NOT_READY',
      generatedAt: raw.report?.generatedAt ?? null,
      fileName: raw.report?.fileName ?? null,
      professional: { ...emptyProfessional(), ...(raw.report?.professional ?? {}) },
      ...(raw.report?.status === 'GENERATED' ? { status: 'GENERATED' as const } : {}),
    },
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  })
}

function readAll(): Evaluation[] {
  const raw = storage().getItem(STORAGE_KEY)
  if (raw === null) return migrateLegacy()
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('El almacén no contiene una lista de evaluaciones.')
    return parsed.map(hydrate)
  } catch (error) {
    throw new EvaluationStoreError('Los datos guardados están dañados y no se pudieron leer.', error)
  }
}

function writeAll(evaluations: Evaluation[]) {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(evaluations))
  } catch (error) {
    throw new EvaluationStoreError('No se pudo guardar. Es posible que el almacenamiento esté lleno.', error)
  }
  notify()
}

/**
 * Traslada los expedientes de formatos anteriores. `hydrate` se encarga de
 * rellenar lo que falte, así que basta con recuperar lo que sí existía.
 */
function migrateLegacy(): Evaluation[] {
  for (const key of LEGACY_KEYS) {
    let raw: string | null = null
    try {
      raw = storage().getItem(key)
    } catch {
      return []
    }
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length === 0) continue
      const migrated = parsed.map((record: Record<string, unknown>) => {
        const evaluation = hydrate(record as Partial<Evaluation>)
        // El motivo vivía dentro de los datos iniciales antes de tener etapa.
        const legacyReason = (record.initialData as { reason?: string } | undefined)?.reason
        const legacySource = (record.initialData as { referralSource?: string } | undefined)?.referralSource
        return {
          ...evaluation,
          referral: {
            ...evaluation.referral,
            reason: evaluation.referral.reason || legacyReason || '',
            source: evaluation.referral.source || legacySource || '',
          },
        }
      })
      writeAll(migrated)
      return migrated
    } catch {
      continue
    }
  }
  return []
}

function nextCode(existing: Evaluation[]) {
  const year = new Date().getFullYear()
  const prefix = `EV-${year}-`
  const highest = existing
    .map((evaluation) => Number(evaluation.code.startsWith(prefix) ? evaluation.code.slice(prefix.length) : 0))
    .reduce((max, value) => (Number.isFinite(value) && value > max ? value : max), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

// --- Suscripción -----------------------------------------------------------

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

/** Avisa de cambios propios y de otras pestañas del mismo navegador. */
export function subscribe(listener: Listener) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

// --- API pública -----------------------------------------------------------

export async function listEvaluations(evaluatorId?: string): Promise<Evaluation[]> {
  const all = readAll()
  const scoped = evaluatorId ? all.filter((evaluation) => evaluation.evaluatorId === evaluatorId) : all
  return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getEvaluation(id: string): Promise<Evaluation | null> {
  return readAll().find((evaluation) => evaluation.id === id) ?? null
}

export type CreateEvaluationInput = {
  evaluatorId: string
  evaluatorName: string
  institutionId: string
  initialData: InitialData
}

export async function createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
  const all = readAll()
  const now = new Date().toISOString()

  const evaluation = reconcile({
    id: crypto.randomUUID(),
    code: nextCode(all),
    evaluatorId: input.evaluatorId,
    evaluatorName: input.evaluatorName,
    institutionId: input.institutionId,
    status: 'DRAFT',
    currentStep: 'motivo',
    initialData: input.initialData,
    referral: emptyReferral(),
    background: emptyBackground(),
    interventions: [],
    functionalAreas: emptyFunctionalAreas(),
    instrumentApplications: {},
    interpretation: '',
    conclusions: [],
    recommendations: emptyRecommendations(),
    report: {
      status: 'NOT_READY',
      generatedAt: null,
      fileName: null,
      // El profesional responsable se propone desde la sesión y es editable.
      professional: { ...emptyProfessional(), name: input.evaluatorName },
    },
    createdAt: now,
    updatedAt: now,
  })

  writeAll([evaluation, ...all])
  return evaluation
}

/**
 * Aplica una mutación sobre la evaluación almacenada y devuelve el resultado ya
 * reconciliado. La vista propone cambios; el almacén decide el estado final.
 */
export async function updateEvaluation(
  id: string,
  mutate: (evaluation: Evaluation) => Evaluation,
): Promise<Evaluation> {
  const all = readAll()
  const index = all.findIndex((evaluation) => evaluation.id === id)
  if (index === -1) throw new EvaluationStoreError('La evaluación ya no existe.')

  const next = reconcile({ ...mutate(all[index]), updatedAt: new Date().toISOString() })
  const updated = [...all]
  updated[index] = next
  writeAll(updated)
  return next
}

export async function setCurrentStep(id: string, step: StepId) {
  return updateEvaluation(id, (evaluation) => ({ ...evaluation, currentStep: step }))
}

export async function deleteEvaluation(id: string): Promise<void> {
  writeAll(readAll().filter((evaluation) => evaluation.id !== id))
}
