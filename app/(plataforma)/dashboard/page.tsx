import type { Metadata } from 'next'
import { EvaluationDashboard } from '@/features/evaluations/dashboard/evaluation-dashboard'
import { requirePermission } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Inicio | Detection-test',
  description: 'Centro de trabajo psicopedagogico del profesional autenticado.',
}

export default async function DashboardPage() {
  await requirePermission('dashboard.read')
  return <EvaluationDashboard />
}
