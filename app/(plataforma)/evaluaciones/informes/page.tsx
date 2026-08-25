import type { Metadata } from 'next'
import { ReportsArchive } from '@/features/evaluations/report/reports-archive'
import { requirePermission } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Informes emitidos | Detection-test' }

export default async function Page() {
  await requirePermission('evaluations.read')
  return <ReportsArchive />
}
