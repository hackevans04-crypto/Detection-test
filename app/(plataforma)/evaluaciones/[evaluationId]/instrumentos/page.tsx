import type { Metadata } from 'next'
import { InstrumentsStep } from '@/features/evaluations/steps/instruments-step'

export const metadata: Metadata = { title: 'Instrumentos | Detection-test' }

export default function Page() {
  return <InstrumentsStep />
}
