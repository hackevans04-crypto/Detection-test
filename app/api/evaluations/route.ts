import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import {
  createEvaluationWorkspace,
  EvaluationPersistenceError,
  listEvaluationWorkspaces,
} from '@/lib/evaluations/server-store'
import type { InitialData } from '@/lib/evaluations/model'

export const runtime = 'nodejs'

function failure(error: unknown) {
  if (error instanceof EvaluationPersistenceError) {
    return NextResponse.json({ error: error.message, code: 'DATABASE_UNAVAILABLE' }, { status: error.status })
  }
  console.error('[evaluations] error inesperado', error)
  return NextResponse.json({ error: 'No se pudo sincronizar con el servidor.', code: 'SERVER_ERROR' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission('evaluations.read')
    const url = new URL(request.url)
    const evaluatorId = url.searchParams.get('evaluatorId') || session.user.id
    const evaluations = await listEvaluationWorkspaces(evaluatorId)
    return NextResponse.json({ evaluations }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission('evaluations.update')
    const body = (await request.json()) as {
      evaluatorId?: string
      evaluatorName?: string
      institutionId?: string
      initialData?: InitialData
    }

    if (!body.initialData) {
      return NextResponse.json({ error: 'Faltan los datos iniciales de la evaluación.' }, { status: 400 })
    }

    const evaluation = await createEvaluationWorkspace({
      evaluatorId: body.evaluatorId || session.user.id,
      evaluatorName: body.evaluatorName || session.user.name,
      institutionId: body.institutionId || session.institution.id,
      initialData: body.initialData,
    })

    return NextResponse.json({ evaluation }, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}
