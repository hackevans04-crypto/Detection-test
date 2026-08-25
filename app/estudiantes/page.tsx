import { CasesModule } from '@/features/cases/cases-module'
import { requirePermission } from '@/lib/auth/session'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Casos y expedientes | Detection-test',
  description: 'Administra los casos utilizados en las evaluaciones psicopedagogicas.',
}

export default function StudentsPage() {
  requirePermission('students.read')

  return <CasesModule />
}


