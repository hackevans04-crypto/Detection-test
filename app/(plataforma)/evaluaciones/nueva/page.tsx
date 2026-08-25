import type { Metadata } from 'next'
import { NewEvaluation } from '@/features/evaluations/new/new-evaluation'
import { requirePermission } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Nueva evaluacion | Detection-test',
  description: 'Registra al evaluado e inicia un proceso de evaluacion psicopedagogica.',
}

export default async function NewEvaluationPage() {
  await requirePermission('evaluations.create')
  return <NewEvaluation />
}
