import { EvaluationFlow } from '@/components/platform/evaluation-flow'
import { requirePermission } from '@/lib/auth/session'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nueva evaluación | Detection-test',
  description: 'Flujo guiado para crear y completar una nueva evaluación psicopedagógica.',
}

export default function NewEvaluationPage() {
  requirePermission('evaluations.create')

  return <EvaluationFlow />
}
