import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import {
  deleteEvaluationWorkspace,
  EvaluationPersistenceError,
  getEvaluationWorkspace,
  saveEvaluationWorkspace,
} from '@/lib/evaluations/server-store'
import type { Evaluation } from '@/lib/evaluations/model'

export const runtime = 'nodejs'

function failure(error: unknown) {
  if (error instanceof EvaluationPersistenceError) {
    return NextResponse.json({ error: error.message, code: 'DATABASE_UNAVAILABLE' }, { status: error.status })
  }
  console.error('[evaluation-workspace] error inesperado', error)
  return NextResponse.json({ error: 'No se pudo sincronizar con el servidor.', code: 'SERVER_ERROR' }, { status: 500 })
}

export async function GET(_request: Request, { params }: { params: Promise<{ evaluationId: string }> }) {
  try {
    await requirePermission('evaluations.read')
    const { evaluationId } = await params
    const evaluation = await getEvaluationWorkspace(evaluationId)
    if (!evaluation) return NextResponse.json({ error: 'Evaluación no encontrada.' }, { status: 404 })
    return NextResponse.json({ evaluation }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ evaluationId: string }> }) {
  try {
    await requirePermission('evaluations.update')
    const { evaluationId } = await params
    const body = (await request.json()) as { evaluation?: Evaluation }
    if (!body.evaluation) {
      return NextResponse.json({ error: 'Falta el expediente a guardar.' }, { status: 400 })
    }
    if (body.evaluation.id !== evaluationId) {
      return NextResponse.json({ error: 'El expediente no coincide con la ruta solicitada.' }, { status: 409 })
    }

    const evaluation = await saveEvaluationWorkspace(body.evaluation)
    return NextResponse.json({ evaluation })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ evaluationId: string }> }) {
  try {
    await requirePermission('evaluations.update')
    const { evaluationId } = await params
    await deleteEvaluationWorkspace(evaluationId)
    return new Response(null, { status: 204 })
  } catch (error) {
    return failure(error)
  }
}
