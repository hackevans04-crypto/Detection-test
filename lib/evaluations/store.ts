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
import { normalizeEvaluationRuntimeState } from '@/lib/evaluations/runtime-migrations'

export const DESIGN_MODE =
  process.env.NEXT_PUBLIC_DESIGN_MODE === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DESIGN_MODE !== 'false')

const DESIGN_STORAGE_KEY = 'detection-test.design.evaluations.session'
const LEGACY_DESIGN_KEYS = ['detection-test.evaluations.v4', 'detection-test.evaluations.v3', 'detection-test.evaluations.v2']
const CURRENT_DESIGN_EVALUATION_ID = '35418c91-ad0c-451e-af56-2ab77382c0b2'

export class EvaluationStoreError extends Error {
  constructor(message: string, readonly cause?: unknown, readonly status?: number) {
    super(message)
    this.name = 'EvaluationStoreError'
  }
}

export type CreateEvaluationInput = {
  evaluatorId: string
  evaluatorName: string
  institutionId: string
  initialData: InitialData
}

export type EvaluationRepository = {
  listEvaluations(evaluatorId?: string): Promise<Evaluation[]>
  getEvaluation(id: string): Promise<Evaluation | null>
  saveEvaluation(evaluation: Evaluation): Promise<Evaluation>
  createEvaluation(input: CreateEvaluationInput): Promise<Evaluation>
  deleteEvaluation(id: string): Promise<void>
  updateStep(id: string, step: StepId): Promise<Evaluation>
  setActiveInstrument(id: string, instrumentId: string | null): Promise<void>
  getActiveInstrument(id: string): Promise<string | null>
  listInstruments(id: string): Promise<Evaluation['battery']>
}

function reconcile(evaluation: Evaluation): Evaluation {
  const normalized = normalizeEvaluationRuntimeState(evaluation)
  const instrumentApplications = Object.fromEntries(
    Object.entries(normalized.instrumentApplications).map(([id, application]) => {
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

  const withApplications: Evaluation = { ...normalized, instrumentApplications }
  const report = { ...withApplications.report, status: deriveReportStatus(withApplications) }
  const withReport: Evaluation = { ...withApplications, report }
  return { ...withReport, status: deriveStatus(withReport) }
}

function hydrate(raw: Partial<Evaluation> & Record<string, unknown>): Evaluation {
  const initialData = { ...emptyInitialData(), ...(raw.initialData ?? {}) } as InitialData
  initialData.person = { ...emptyInitialData().person, ...(raw.initialData?.person ?? {}) }
  initialData.family = { ...emptyInitialData().family, ...(raw.initialData?.family ?? {}) }

  return reconcile({
    id: raw.id ?? crypto.randomUUID(),
    code: raw.code ?? 'EV-2026-0001',
    evaluatorId: raw.evaluatorId ?? 'profesional-local',
    evaluatorName: raw.evaluatorName ?? 'Profesional',
    institutionId: raw.institutionId ?? 'institucion-local',
    status: 'DRAFT',
    currentStep: (raw.currentStep as StepId) ?? 'datos-iniciales',
    initialData,
    referral: { ...emptyReferral(), ...(raw.referral ?? {}) },
    background: { ...emptyBackground(), ...(raw.background ?? {}) },
    interventions: Array.isArray(raw.interventions) ? raw.interventions : [],
    functionalAreas: { ...emptyFunctionalAreas(), ...(raw.functionalAreas ?? {}) },
    instrumentApplications: raw.instrumentApplications ?? {},
    instrumentIngestionJobs: Array.isArray(raw.instrumentIngestionJobs) ? raw.instrumentIngestionJobs : [],
    instrumentBlueprints: raw.instrumentBlueprints && typeof raw.instrumentBlueprints === 'object' ? raw.instrumentBlueprints : {},
    battery: Array.isArray(raw.battery) ? raw.battery : [],
    instrumentPackages: Array.isArray(raw.instrumentPackages) ? raw.instrumentPackages : [],
    backups: Array.isArray(raw.backups) ? raw.backups : [],
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

function seedDesignEvaluation(): Evaluation {
  const initialData = emptyInitialData()
  initialData.person = {
    ...initialData.person,
    fullName: 'Christopher Alexander Andino Medina',
    birthDate: '2017-06-16',
    sex: 'Masculino',
    institution: 'Unidad educativa',
    grade: '4',
  }
  initialData.evaluationDate = '2026-09-03'

  const functionalAreas = emptyFunctionalAreas()
  functionalAreas['conocimiento-corporal'] = {
    description: 'Reconoce segmentos corporales principales durante la observación.',
    performance: 'En desarrollo',
    observations: '',
    fields: {},
  }
  functionalAreas['motricidad-fina'] = {
    description: 'Se observan necesidades de precisión grafomotriz para revisar con instrumentos.',
    performance: 'En desarrollo',
    observations: '',
    fields: {},
  }

  return reconcile({
    id: CURRENT_DESIGN_EVALUATION_ID,
    code: 'EV-2026-0001',
    evaluatorId: 'profesional-local',
    evaluatorName: 'Profesional',
    institutionId: 'institucion-local',
    status: 'DRAFT',
    currentStep: 'instrumentos',
    initialData,
    referral: {
      reason: 'Evaluación psicopedagógica integral para identificar necesidades de apoyo en el proceso escolar.',
      source: 'Institución educativa',
      officeNumber: '',
      officeDate: '',
      documentNumber: '',
      requestText: 'Se solicita valoración psicopedagógica para orientar apoyos educativos.',
    },
    background: {
      ...emptyBackground(),
      'contexto-educativo': {
        'observacion-aula.descripcion': 'Pendiente de ampliar durante la entrevista y observación.',
      },
    },
    interventions: [],
    functionalAreas,
    instrumentApplications: {},
    instrumentIngestionJobs: [],
    instrumentBlueprints: {},
    battery: [],
    instrumentPackages: [],
    backups: [],
    interpretation: '',
    conclusions: [],
    recommendations: emptyRecommendations(),
    report: {
      status: 'NOT_READY',
      generatedAt: null,
      fileName: null,
      professional: { ...emptyProfessional(), name: 'Profesional', role: 'Psicopedagogía' },
    },
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
  })
}

function browserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const probe = '__detection_test_design_probe__'
    window.sessionStorage.setItem(probe, '1')
    window.sessionStorage.removeItem(probe)
    return window.sessionStorage
  } catch {
    return null
  }
}

function readJsonList(value: string | null): Evaluation[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    return parsed.map((item) => hydrate(item as Partial<Evaluation> & Record<string, unknown>))
  } catch {
    return null
  }
}

function readLegacyDesignData(): Evaluation[] {
  if (typeof window === 'undefined') return []
  if (typeof window.localStorage?.getItem !== 'function') return []
  for (const key of LEGACY_DESIGN_KEYS) {
    const migrated = readJsonList(window.localStorage.getItem(key))
    if (migrated && migrated.length > 0) return migrated
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

abstract class BaseRepository implements EvaluationRepository {
  async updateStep(id: string, step: StepId): Promise<Evaluation> {
    const evaluation = await this.getEvaluation(id)
    if (!evaluation) throw new EvaluationStoreError('La evaluación ya no existe.', null, 404)
    return this.saveEvaluation({ ...evaluation, currentStep: step })
  }

  async setActiveInstrument(_id: string, _instrumentId: string | null): Promise<void> {
    return
  }

  async getActiveInstrument(_id: string): Promise<string | null> {
    return null
  }

  async listInstruments(id: string): Promise<Evaluation['battery']> {
    return (await this.getEvaluation(id))?.battery ?? []
  }

  abstract listEvaluations(evaluatorId?: string): Promise<Evaluation[]>
  abstract getEvaluation(id: string): Promise<Evaluation | null>
  abstract saveEvaluation(evaluation: Evaluation): Promise<Evaluation>
  abstract createEvaluation(input: CreateEvaluationInput): Promise<Evaluation>
  abstract deleteEvaluation(id: string): Promise<void>
}

class DesignEvaluationStore extends BaseRepository {
  private evaluations: Evaluation[]

  constructor() {
    super()
    const fromSession = readJsonList(browserSessionStorage()?.getItem(DESIGN_STORAGE_KEY) ?? null)
    const fromLegacy = fromSession ?? readLegacyDesignData()
    const seeded = seedDesignEvaluation()
    this.evaluations = fromLegacy.some((evaluation) => evaluation.id === seeded.id) ? fromLegacy : [seeded, ...fromLegacy]
    this.persist()
    if (typeof window !== 'undefined') console.info('[Design Mode] Evaluation store activo')
  }

  private persist() {
    browserSessionStorage()?.setItem(DESIGN_STORAGE_KEY, JSON.stringify(this.evaluations))
  }

  async listEvaluations(evaluatorId?: string): Promise<Evaluation[]> {
    const scoped = evaluatorId ? this.evaluations.filter((evaluation) => evaluation.evaluatorId === evaluatorId) : this.evaluations
    return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getEvaluation(id: string): Promise<Evaluation | null> {
    const found = this.evaluations.find((evaluation) => evaluation.id === id)
    if (found) return found
    console.warn(`[Design Mode] Evaluación ${id} no existe; se usa expediente de diseño.`)
    return this.evaluations[0] ?? null
  }

  async saveEvaluation(evaluation: Evaluation): Promise<Evaluation> {
    const next = reconcile({ ...evaluation, updatedAt: new Date().toISOString() })
    const index = this.evaluations.findIndex((item) => item.id === next.id)
    this.evaluations =
      index >= 0
        ? this.evaluations.map((item, itemIndex) => (itemIndex === index ? next : item))
        : [next, ...this.evaluations]
    this.persist()
    return next
  }

  async createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
    const now = new Date().toISOString()
    const evaluation = reconcile({
      id: crypto.randomUUID(),
      code: nextCode(this.evaluations),
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
      instrumentIngestionJobs: [],
      instrumentBlueprints: {},
      battery: [],
      instrumentPackages: [],
      backups: [],
      interpretation: '',
      conclusions: [],
      recommendations: emptyRecommendations(),
      report: {
        status: 'NOT_READY',
        generatedAt: null,
        fileName: null,
        professional: { ...emptyProfessional(), name: input.evaluatorName },
      },
      createdAt: now,
      updatedAt: now,
    })
    this.evaluations = [evaluation, ...this.evaluations]
    this.persist()
    return evaluation
  }

  async deleteEvaluation(id: string): Promise<void> {
    this.evaluations = this.evaluations.filter((evaluation) => evaluation.id !== id)
    this.persist()
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = await readPayload(response)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'No se pudo sincronizar con el servidor.'
    throw new EvaluationStoreError(message, payload, response.status)
  }

  return payload as T
}

class ServerEvaluationStore extends BaseRepository {
  async listEvaluations(evaluatorId?: string): Promise<Evaluation[]> {
    const search = evaluatorId ? `?evaluatorId=${encodeURIComponent(evaluatorId)}` : ''
    const { evaluations } = await requestJson<{ evaluations: Evaluation[] }>(`/api/evaluations${search}`)
    return evaluations
  }

  async getEvaluation(id: string): Promise<Evaluation | null> {
    try {
      const { evaluation } = await requestJson<{ evaluation: Evaluation }>(`/api/evaluations/${encodeURIComponent(id)}/workspace`)
      return evaluation
    } catch (error) {
      if (error instanceof EvaluationStoreError && error.status === 404) return null
      throw error
    }
  }

  async saveEvaluation(evaluation: Evaluation): Promise<Evaluation> {
    const next = reconcile({ ...evaluation, updatedAt: new Date().toISOString() })
    const { evaluation: saved } = await requestJson<{ evaluation: Evaluation }>(
      `/api/evaluations/${encodeURIComponent(next.id)}/workspace`,
      {
        method: 'PATCH',
        body: JSON.stringify({ evaluation: next }),
      },
    )
    return saved
  }

  async createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
    const { evaluation } = await requestJson<{ evaluation: Evaluation }>('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return evaluation
  }

  async deleteEvaluation(id: string): Promise<void> {
    const response = await fetch(`/api/evaluations/${encodeURIComponent(id)}/workspace`, {
      method: 'DELETE',
      cache: 'no-store',
    })
    if (!response.ok) {
      const payload = await readPayload(response)
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : 'No se pudo sincronizar con el servidor.'
      throw new EvaluationStoreError(message, payload, response.status)
    }
  }
}

function shouldUseLocalFallback(error: unknown) {
  if (error instanceof TypeError) return true
  if (!(error instanceof EvaluationStoreError)) return false
  return error.status === 503 || error.status === 502 || error.status === 0
}

class ResilientEvaluationStore extends BaseRepository {
  private localFallback: DesignEvaluationStore | null = null

  constructor(private readonly server = new ServerEvaluationStore()) {
    super()
  }

  private fallback(error: unknown) {
    if (!shouldUseLocalFallback(error)) throw error
    this.localFallback ??= new DesignEvaluationStore()
    console.warn('[Evaluation Store] Servidor no disponible; usando almacenamiento local de sesion.', error)
    return this.localFallback
  }

  async listEvaluations(evaluatorId?: string): Promise<Evaluation[]> {
    if (this.localFallback) return this.localFallback.listEvaluations(evaluatorId)
    try {
      return await this.server.listEvaluations(evaluatorId)
    } catch (error) {
      const fallback = this.fallback(error)
      const evaluations = await fallback.listEvaluations(evaluatorId)
      return evaluations.length > 0 ? evaluations : fallback.listEvaluations()
    }
  }

  async getEvaluation(id: string): Promise<Evaluation | null> {
    if (this.localFallback) return this.localFallback.getEvaluation(id)
    try {
      return await this.server.getEvaluation(id)
    } catch (error) {
      return this.fallback(error).getEvaluation(id)
    }
  }

  async saveEvaluation(evaluation: Evaluation): Promise<Evaluation> {
    if (this.localFallback) return this.localFallback.saveEvaluation(evaluation)
    try {
      return await this.server.saveEvaluation(evaluation)
    } catch (error) {
      return this.fallback(error).saveEvaluation(evaluation)
    }
  }

  async createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
    if (this.localFallback) return this.localFallback.createEvaluation(input)
    try {
      return await this.server.createEvaluation(input)
    } catch (error) {
      return this.fallback(error).createEvaluation(input)
    }
  }

  async deleteEvaluation(id: string): Promise<void> {
    if (this.localFallback) return this.localFallback.deleteEvaluation(id)
    try {
      await this.server.deleteEvaluation(id)
    } catch (error) {
      await this.fallback(error).deleteEvaluation(id)
    }
  }
}

function createRepository(): EvaluationRepository {
  return DESIGN_MODE ? new DesignEvaluationStore() : new ResilientEvaluationStore()
}

export const evaluationRepository = createRepository()

type Listener = () => void
const listeners = new Set<Listener>()
const CHANNEL_NAME = 'detection-test.evaluations.changed'

function notify() {
  for (const listener of listeners) listener()
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.postMessage({ type: 'changed' })
  channel.close()
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null
  if (channel) {
    channel.onmessage = () => listener()
  }
  return () => {
    listeners.delete(listener)
    channel?.close()
  }
}

export async function listEvaluations(evaluatorId?: string): Promise<Evaluation[]> {
  return evaluationRepository.listEvaluations(evaluatorId)
}

export async function getEvaluation(id: string): Promise<Evaluation | null> {
  return evaluationRepository.getEvaluation(id)
}

export async function createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
  const evaluation = await evaluationRepository.createEvaluation(input)
  notify()
  return evaluation
}

export async function updateEvaluation(
  id: string,
  mutate: (evaluation: Evaluation) => Evaluation,
): Promise<Evaluation> {
  const current = await evaluationRepository.getEvaluation(id)
  if (!current) throw new EvaluationStoreError('La evaluación ya no existe.', null, 404)
  const evaluation = await evaluationRepository.saveEvaluation(mutate(current))
  notify()
  return evaluation
}

export async function setCurrentStep(id: string, step: StepId) {
  const evaluation = await evaluationRepository.updateStep(id, step)
  notify()
  return evaluation
}

export async function deleteEvaluation(id: string): Promise<void> {
  await evaluationRepository.deleteEvaluation(id)
  notify()
}
