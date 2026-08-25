import type { Metadata } from 'next'
import { Suspense } from 'react'
import { EvaluationList } from '@/features/evaluations/list/evaluation-list'
import { LoadingSkeleton } from '@/components/ui/states'
import { requirePermission } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Evaluacion Psicopedagogica | Detection-test',
  description: 'Gestiona y continua tus procesos de evaluacion psicopedagogica.',
}

export default async function EvaluationsPage() {
  await requirePermission('evaluations.read')
  return (
    <Suspense fallback={<div className="dt-page"><LoadingSkeleton rows={4} height={64} /></div>}>
      <EvaluationList />
    </Suspense>
  )
}
