import type { ReactNode } from 'react'
import { EvaluationWorkspaceShell } from '@/features/evaluations/workspace/workspace-shell'
import { requirePermission } from '@/lib/auth/session'

export default async function EvaluationLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ evaluationId: string }>
}) {
  await requirePermission('evaluations.read')
  const { evaluationId } = await params
  return <EvaluationWorkspaceShell evaluationId={evaluationId}>{children}</EvaluationWorkspaceShell>
}
