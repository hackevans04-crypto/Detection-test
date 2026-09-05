import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
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

export class EvaluationPersistenceError extends Error {
  constructor(message: string, readonly status = 503, readonly cause?: unknown) {
    super(message)
    this.name = 'EvaluationPersistenceError'
  }
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
    code: raw.code ?? 'EV-SIN-CODIGO',
    evaluatorId: raw.evaluatorId ?? '',
    evaluatorName: raw.evaluatorName ?? '',
    institutionId: raw.institutionId ?? '',
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

function payloadOf(record: { payload: unknown }) {
  return hydrate(record.payload as Partial<Evaluation> & Record<string, unknown>)
}

function jsonPayload(evaluation: Evaluation): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(evaluation)) as Prisma.InputJsonValue
}

function persistenceError(error: unknown): EvaluationPersistenceError {
  return new EvaluationPersistenceError(
    'No se pudo sincronizar con el servidor.',
    503,
    error,
  )
}

export async function listEvaluationWorkspaces(evaluatorId?: string): Promise<Evaluation[]> {
  try {
    const records = await prisma.evaluationWorkspace.findMany({
      where: evaluatorId ? { evaluatorId } : undefined,
      orderBy: { updatedAt: 'desc' },
      select: { payload: true },
    })
    return records.map(payloadOf)
  } catch (error) {
    throw persistenceError(error)
  }
}

export async function getEvaluationWorkspace(id: string): Promise<Evaluation | null> {
  try {
    const record = await prisma.evaluationWorkspace.findUnique({ where: { id }, select: { payload: true } })
    return record ? payloadOf(record) : null
  } catch (error) {
    throw persistenceError(error)
  }
}

export async function createEvaluationWorkspace(input: {
  evaluatorId: string
  evaluatorName: string
  institutionId: string
  initialData: InitialData
}): Promise<Evaluation> {
  const all = await listEvaluationWorkspaces(input.evaluatorId)
  const now = new Date().toISOString()
  const year = new Date().getFullYear()
  const prefix = `EV-${year}-`
  const highest = all
    .map((evaluation) => Number(evaluation.code.startsWith(prefix) ? evaluation.code.slice(prefix.length) : 0))
    .reduce((max, value) => (Number.isFinite(value) && value > max ? value : max), 0)

  const evaluation = reconcile({
    id: crypto.randomUUID(),
    code: `${prefix}${String(highest + 1).padStart(4, '0')}`,
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

  try {
    await prisma.evaluationWorkspace.create({
      data: {
        id: evaluation.id,
        code: evaluation.code,
        evaluatorId: evaluation.evaluatorId,
        institutionId: evaluation.institutionId,
        payload: jsonPayload(evaluation),
      },
    })
    return evaluation
  } catch (error) {
    throw persistenceError(error)
  }
}

export async function saveEvaluationWorkspace(evaluation: Evaluation): Promise<Evaluation> {
  const next = reconcile({ ...evaluation, updatedAt: new Date().toISOString() })
  try {
    await prisma.evaluationWorkspace.update({
      where: { id: next.id },
      data: {
        code: next.code,
        evaluatorId: next.evaluatorId,
        institutionId: next.institutionId,
        payload: jsonPayload(next),
      },
    })
    return next
  } catch (error) {
    throw persistenceError(error)
  }
}

export async function deleteEvaluationWorkspace(id: string): Promise<void> {
  try {
    await prisma.evaluationWorkspace.delete({ where: { id } })
  } catch (error) {
    throw persistenceError(error)
  }
}
