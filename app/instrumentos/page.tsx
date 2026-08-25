import { InstrumentsModule } from '@/features/instruments/instruments-module'
import { requirePermission } from '@/lib/auth/session'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Instrumentos | Detection-test',
  description: 'Biblioteca de instrumentos de evaluación psicopedagógica.',
}

export default function InstrumentsPage() {
  requirePermission('instruments.read')

  return <InstrumentsModule />
}
